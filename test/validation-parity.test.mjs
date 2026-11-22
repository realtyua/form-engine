// MOD-12: page and modal must answer the same validation question. The shared
// boot owns DNS checks and submit; both profiles only supply their own chrome.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHTML } from 'linkedom';

import { boot } from '../runtime/app.js';
import { renderModal, renderPage } from '../runtime/shell.js';
import { patternMessage } from '../runtime/validation.js';

const PAGE = 'parity-page';
const MODAL = 'parity-modal';
const PAGE_ENDPOINT = '/api/parity-page';
const MODAL_ENDPOINT = '/api/parity-modal';
const DNS_MESSAGE = 'Домен не приймає пошту або не існує';

const flush = async () => {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

// The engine debounces DNS for 500ms. Keep the callback but never run it on a
// real timer: submitting has to flush it through ctx.shared.waitForAsync().
function captureTimers() {
  const scheduled = [];
  const later = (fn, ms) => {
    const handle = setTimeout(() => {}, 0);
    clearTimeout(handle);
    scheduled.push({ fn, ms, handle });
    return handle;
  };
  return { later, scheduled };
}

function fieldConfig(extra = {}) {
  return {
    version: 1,
    theme: 'bootstrap4',
    settings: extra.settings || {},
    submit: { action: '/unused' },
    steps: [{
      id: 'main',
      title: 'Main',
      rows: [{ fields: extra.fields || [] }],
    }],
    behavior: extra.behavior || {},
  };
}

function mount({ fields, settings = {}, captcha = null, timers, fetchImpl }) {
  const pageConfig = fieldConfig({
    fields,
    settings,
    behavior: { mode: 'page' },
  });
  const modalConfig = fieldConfig({
    fields,
    settings,
    behavior: { mode: 'modal', modal: '#parity-dialog' },
  });

  const html = `<!doctype html><html><body>
    ${renderPage(pageConfig, { name: PAGE, endpoint: PAGE_ENDPOINT })}
    <div class="modal" id="parity-dialog">
      ${renderModal(modalConfig, { name: MODAL, endpoint: MODAL_ENDPOINT, turnstile: null })}
      <div data-form-error class="d-none"></div>
      <div data-form-success class="d-none"></div>
    </div>
  </body></html>`;

  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Element = window.Element;
  globalThis.Event = window.Event;

  const handles = boot(window.document, {
    Captcha: captcha,
    setTimeout: timers ? timers.later : undefined,
    setInterval: () => 0,
    leaflet: null,
    fetch: fetchImpl || (() => Promise.resolve({ ok: true, json: async () => ({ success: true }) })),
  });
  const page = handles.find((handle) => handle.name === PAGE);
  const modal = handles.find((handle) => handle.name === MODAL);
  assert.ok(page && modal, 'both profiles boot from one shared discovery pass');
  return { window, document: window.document, handles, page, modal };
}

const submit = (window, handle) =>
  handle.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

test('patternMessage resolves field, feedback and settings copy in one order', () => {
  const withFeedback = {
    config: {
      settings: {
        feedback: { pattern: 'settings feedback' },
        patternMessage: 'settings patternMessage',
        validation: { pattern: 'settings validation' },
      },
    },
    data: {},
  };
  assert.equal(patternMessage({}, withFeedback), 'settings feedback');
  assert.equal(patternMessage({ validation: { pattern: 'field validation' } }, withFeedback), 'field validation');
  assert.equal(patternMessage({ feedback: { pattern: 'field feedback' } }, withFeedback), 'field feedback');

  const withoutFeedback = {
    config: {
      settings: {
        patternMessage: 'settings patternMessage',
        validation: { pattern: 'settings validation' },
      },
    },
    data: {},
  };
  assert.equal(patternMessage({}, withoutFeedback), 'settings patternMessage');
  assert.equal(
    patternMessage({}, { config: { settings: { validation: { pattern: 'settings validation' } } }, data: {} }),
    'settings validation',
  );
  assert.equal(patternMessage({}, { config: {}, data: {} }), 'Неправильний формат');
});

test('a failed dnscheck blocks page and modal submit until the domain changes', async () => {
  const timers = captureTimers();
  let dnsAnswer = { Answer: [] };
  const submitCalls = [];
  let dnsCalls = 0;

  const fields = [{
    name: 'contact_email',
    type: 'email',
    label: 'Email',
    validation: { dnscheck: { value: true, message: DNS_MESSAGE } },
  }];
  const fetchImpl = (url) => {
    if (String(url).indexOf('cloudflare-dns.com') !== -1) {
      dnsCalls += 1;
      return Promise.resolve({ ok: true, json: async () => dnsAnswer });
    }
    submitCalls.push(url);
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };
  const mounted = mount({ fields, timers, fetchImpl });
  const { window, page, modal } = mounted;

  for (const handle of [page, modal]) {
    handle.controller.setData('contact_email', 'nobody@dead.example');
  }

  submit(window, page);
  submit(window, modal);
  await flush();

  assert.equal(submitCalls.length, 0, 'neither profile submits a domain without mail records');
  assert.ok(dnsCalls >= 6, 'each profile asked MX, A and AAAA');
  assert.deepEqual(
    [page, modal].map((handle) => handle.controller.fieldError('contact_email')),
    [DNS_MESSAGE, DNS_MESSAGE],
  );
  assert.deepEqual(
    [page, modal].map((handle) => handle.controller.visibleError('contact_email')),
    [DNS_MESSAGE, DNS_MESSAGE],
  );
  assert.deepEqual(
    [page, modal].map((handle) => handle.form.querySelector('[data-error="contact_email"]').textContent.trim()),
    [DNS_MESSAGE, DNS_MESSAGE],
    'the binder renders the page-layer verdict in both profiles',
  );
  assert.deepEqual(
    [page, modal].map((handle) => handle.controller.validateAll()),
    [false, false],
    'validateAll keeps the async verdict instead of erasing it',
  );

  dnsAnswer = { Answer: [{ name: 'live.example', type: 'MX' }] };
  for (const handle of [page, modal]) {
    handle.controller.setData('contact_email', 'nobody@live.example');
  }
  submit(window, page);
  submit(window, modal);
  await flush();

  assert.deepEqual(submitCalls.sort(), [MODAL_ENDPOINT, PAGE_ENDPOINT],
    'a live domain lets both profiles through after the next check');
  assert.deepEqual(
    [page, modal].map((handle) => handle.controller.fieldError('contact_email')),
    ['', ''],
    'a new value clears the stale glue error',
  );
});

test('synchronous required, pattern and length copy is identical for page and modal', async () => {
  const fields = [
    { name: 'required_text', type: 'text', label: 'Required', required: true },
    {
      name: 'pattern_field',
      type: 'text',
      label: 'Pattern',
      pattern: '^[0-9]+$',
      feedback: { pattern: 'Field pattern copy' },
    },
    { name: 'pattern_global', type: 'text', label: 'Global', pattern: '^[0-9]+$' },
    {
      name: 'length_text',
      type: 'text',
      label: 'Length',
      minlength: 3,
      maxlength: 5,
      validation: { minlength: 'Field min', maxlength: 'Field max' },
    },
  ];
  const settings = {
    required: { message: 'Settings required' },
    patternMessage: 'Settings patternMessage',
  };
  const { page, modal } = mount({ fields, settings });
  const cases = [
    ['required_text', '', 'Settings required'],
    ['pattern_field', 'abc', 'Field pattern copy'],
    ['pattern_global', 'abc', 'Settings patternMessage'],
    ['length_text', 'ab', 'Field min'],
    ['length_text', 'abcdef', 'Field max'],
  ];

  for (const [name, value, message] of cases) {
    for (const handle of [page, modal]) {
      handle.controller.setData(name, value);
      handle.controller.validateField(name);
    }
    await flush();

    assert.deepEqual(
      [page, modal].map((handle) => handle.controller.visibleError(name)),
      [message, message],
      `${name} speaks with the same copy in both profiles`,
    );
    assert.deepEqual(
      [page, modal].map((handle) => handle.form.querySelector(`[data-error="${name}"]`).textContent.trim()),
      [message, message],
      `${name} renders the same feedback in both profiles`,
    );
  }
});

test('a function-valued Captcha.enabled is honoured by both profiles', async () => {
  const fields = [
    { name: 'reference', type: 'text', label: 'Reference' },
    { name: 'captcha', type: 'widgets', widget: 'captcha', label: 'Captcha' },
  ];

  for (const enabled of [false, true]) {
    const submitCalls = [];
    const { window, page, modal } = mount({
      fields,
      captcha: { enabled: () => enabled, solved: () => false, token: () => '' },
      fetchImpl: (url) => {
        submitCalls.push(url);
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      },
    });
    for (const handle of [page, modal]) {
      handle.controller.setData('reference', 'P-12');
    }

    submit(window, page);
    submit(window, modal);
    await flush();

    assert.equal(submitCalls.length, enabled ? 0 : 2,
      enabled ? 'an enabled unsolved captcha blocks both profiles' : 'a disabled captcha never blocks either profile');
    assert.deepEqual(submitCalls.sort(), enabled ? [] : [MODAL_ENDPOINT, PAGE_ENDPOINT]);
  }
});
