// MOD-17: the same config keeps its widgets and its payload contract in both
// profiles. Encoding comes from config; widget glue is shared, not page-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHTML } from 'linkedom';

import { bootPage } from '../runtime/page-form.js';
import { bootModal } from '../runtime/modal-form.js';
import { FormRender } from '../runtime/render.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function pairConfig(mode, prefix, fields, encoding) {
  const config = {
    version: 1,
    id: `${prefix}-${mode}`,
    theme: 'bootstrap4',
    behavior: { mode },
    settings: { title: 'Parity' },
    submit: { action: `/api/${prefix}-${mode}` },
    steps: [{ id: 'main', rows: [{ fields }] }],
  };
  if (encoding) config.submit.encoding = encoding;
  if (mode === 'modal') {
    config.behavior.modal = `#${prefix}-dialog`;
    config.behavior.seed = `${prefix}-seed`;
  }
  return config;
}

function mountPair(fields, encoding) {
  const pageCfg = pairConfig('page', 'parity', fields, encoding);
  const modalCfg = pairConfig('modal', 'parity', fields, encoding);
  const island = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
  const bakedPage = FormRender.render(pageCfg);
  const bakedModal = FormRender.render(modalCfg);
  const html = `<!doctype html><html><body>
    <script id="parity-page-config" type="application/json">${island(pageCfg)}</script>
    <div id="parity-page-app" data-endpoint="/api/parity-page">${bakedPage}</div>
    <div class="modal" id="parity-dialog">
      <script id="parity-modal-config" type="application/json">${island(modalCfg)}</script>
      <script id="parity-seed" type="application/json">${island({ ref: 'from-page' })}</script>
      <div id="parity-modal-app" data-endpoint="/api/parity-modal">${bakedModal}</div>
    </div>
  </body></html>`;
  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  return { window, document: window.document, pageCfg, modalCfg };
}

function bootPair(document, fetchImpl) {
  const opts = { Captcha: null, leaflet: null, fetch: fetchImpl, setInterval: () => 0, setTimeout: () => 0 };
  return {
    page: bootPage(document, { ...opts, name: 'parity-page' }),
    modal: bootModal(document, { ...opts, name: 'parity-modal' }),
  };
}

async function submitBoth(document, window, handles, calls, value) {
  for (const handle of [handles.page, handles.modal]) {
    handle.controller.setData('ref', value);
    // Flat JSON reads the named controls, so mirror the value into the DOM.
    const input = handle.form.querySelector('[name="ref"]');
    if (input) input.value = value;
  }
  for (const handle of [handles.page, handles.modal]) {
    handle.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }
  await flush(); await flush(); await flush();
  assert.equal(calls.length, 2, 'both profiles submitted exactly once');
  return Object.fromEntries(calls.map((call) => [call.url, call.init]));
}

const textFields = () => [{ name: 'ref', type: 'text', label: 'Reference' }];

test('submit.encoding json sends flat JSON from both profiles', async () => {
  const { window, document } = mountPair(textFields(), 'json');
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };
  const requests = await submitBoth(document, window, bootPair(document, fetchImpl), calls, 'MOD-17');

  for (const url of ['/api/parity-page', '/api/parity-modal']) {
    const init = requests[url];
    assert.ok(init, `${url} was called`);
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(typeof init.body, 'string');
    assert.equal(JSON.parse(init.body).ref, 'MOD-17');
  }
});

test('submit.encoding multipart sends FormData from both profiles', async () => {
  const { window, document } = mountPair(textFields(), 'multipart');
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };
  const requests = await submitBoth(document, window, bootPair(document, fetchImpl), calls, 'M17');

  for (const url of ['/api/parity-page', '/api/parity-modal']) {
    const init = requests[url];
    assert.ok(init, `${url} was called`);
    assert.ok(init.body instanceof window.FormData, `${url} body is FormData`);
    assert.match(init.body.get('data') || '', /M17/);
  }
});

test('the historical defaults survive: page multipart, modal json', async () => {
  const { window, document } = mountPair(textFields());
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };
  const requests = await submitBoth(document, window, bootPair(document, fetchImpl), calls, 'default');

  assert.ok(requests['/api/parity-page'].body instanceof window.FormData);
  assert.equal(JSON.parse(requests['/api/parity-modal'].body).ref, 'default');
});

test('a file widget forces multipart even in the modal profile', async () => {
  const fields = [
    { name: 'ref', type: 'text', label: 'Reference' },
    { name: 'photos', type: 'widgets', widget: 'file', file: { maxSize: '2MB' } },
  ];
  const { window, document } = mountPair(fields);
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };
  const requests = await submitBoth(document, window, bootPair(document, fetchImpl), calls, 'files');

  for (const url of ['/api/parity-page', '/api/parity-modal']) {
    assert.ok(requests[url].body instanceof window.FormData, `${url} body is FormData`);
  }
});

test('widget glue attaches autocomplete and a derived map picker id in the modal too', async () => {
  const fields = [
    { name: 'street', type: 'autocomplete', label: 'Street', minChars: 1, threshold: 1,
      data: [{ id: 'lane', name: 'провулок' }] },
    { name: 'spot', type: 'widgets', widget: 'map', element_id: 'parity-map', label: 'Map' },
  ];
  const { window, document } = mountPair(fields);
  // linkedom exposes select.value as getter-only; the glue writes it on sync.
  for (const select of document.querySelectorAll('select')) {
    const proto = Object.getPrototypeOf(select);
    if (!Object.getOwnPropertyDescriptor(proto, 'value').set) {
      Object.defineProperty(proto, 'value', {
        configurable: true,
        get() {
          const option = (this.options || []).find((item) => item.selected) || null;
          return option ? option.getAttribute('value') : '';
        },
        set(value) {
          for (const option of this.options || []) {
            option.selected = option.getAttribute && option.getAttribute('value') === String(value);
          }
        },
      });
    }
  }
  const handles = bootPair(document, () => Promise.resolve({ ok: true, json: async () => ({}) }));

  assert.ok(handles.modal, 'the modal booted the same widget config');
  assert.ok(document.getElementById('parity-map-picker'),
    'the map picker id comes from the widget config, not a baked literal');

  const scope = document.getElementById('parity-modal-app');
  const search = scope.querySelector('[data-autocomplete-search="street"]');
  assert.ok(search, 'the shared glue rendered the autocomplete search hook in the modal');
  let typed = '';
  Object.defineProperty(search, 'value', {
    configurable: true,
    get: () => typed,
    set: (value) => { typed = String(value); },
  });
  search.dispatchEvent(new window.Event('focus', { bubbles: true }));
  typed = 'пров';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();

  const results = scope.querySelectorAll('[data-autocomplete-dropdown="street"] .dropdown-item');
  assert.ok(results.length, 'the modal autocomplete dropdown offers config data');
  results[0].dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(handles.modal.controller.getValue('street'), 'lane',
    'picking a widget result updates the modal controller just like the page profile');
});
