// MOD-10: the modal life-cycle must come from behavior/config + DOM hooks,
// not from notify-specific ids or a fixed captcha action.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHTML } from 'linkedom';

import { bootModal } from '../runtime/modal-form.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mountModal({ name = 'signup', config, extra = '', legacy = false }) {
  const island = JSON.stringify(config).replace(/</g, '\\u003c');
  const pageIsland = JSON.stringify({ ref: 'page-42' });
  const prefixes = legacy
    ? { app: 'notify-app', config: 'notify-config', page: 'notify-page', modal: 'notifyModal', error: 'notify-error', success: 'notify-success' }
    : { app: `${name}-app`, config: `${name}-config`, page: `${name}-page`, modal: `${name}Modal`, error: `${name}-error`, success: `${name}-success` };
  const html = `<!doctype html><html><body>
    <div class="modal" id="${prefixes.modal}">
      ${extra}
      <script id="${prefixes.config}" type="application/json">${island}</script>
      <script id="${prefixes.page}" type="application/json">${pageIsland}</script>
      <div id="${prefixes.app}" data-endpoint="/api/${name}"></div>
      <div id="${prefixes.error}" class="d-none">Помилка</div>
      <div id="${prefixes.success}" class="d-none">Готово</div>
      <div data-form-notice class="d-none">Локально</div>
      <div data-form-captcha-retry class="d-none">Оновіть перевірку</div>
      <button type="button" data-captcha-retry>Оновити</button>
      <div id="${name}-done" class="d-none">Дякуємо</div>
    </div>
  </body></html>`;
  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  return { window, document: window.document, prefixes };
}

const textConfig = (behavior) => ({
  version: 1,
  id: 'signup',
  theme: 'bootstrap4',
  behavior: { mode: 'modal', ...(behavior || {}) },
  submit: { action: '/api/signup' },
  steps: [{ id: 'main', rows: [{ fields: [{ name: 'ref', type: 'text', label: 'Ref' }] }] }],
});

const okFetch = (calls) => (url, init) => {
  calls.push({ url, init });
  return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
};

test('a generic modal config seeds, resets, submits and shows its own success hooks', async () => {
  const config = textConfig({
    modal: '#signupModal',
    seed: 'signup-page',
    reset: true,
    status: { error: '#signup-error', success: '#signup-success' },
    success: { hide: '#signup-app', show: '#signup-done' },
  });
  const { window, document } = mountModal({ config });
  const calls = [];
  const handle = bootModal(document, {
    name: 'signup',
    Captcha: null,
    fetch: okFetch(calls),
    setTimeout: () => 0,
  });

  assert.ok(handle, 'a non-notify modal config must boot');
  assert.equal(handle.name, 'signup');
  assert.equal(document.querySelector('[name="ref"]').value, 'page-42');

  // show -> reset uses the configured status nodes, not notify ids.
  document.getElementById('signup-error').classList.remove('d-none');
  document.getElementById('signupModal').dispatchEvent(new window.Event('show.bs.modal'));
  assert.ok(document.getElementById('signup-error').classList.contains('d-none'));

  handle.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/signup');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.ref, 'page-42');
  assert.ok(!document.getElementById('signup-success').classList.contains('d-none'));
  assert.ok(document.getElementById('signup-app').classList.contains('d-none'));
  assert.ok(!document.getElementById('signup-done').classList.contains('d-none'));
});

test('captcha action, selector and token come from the config, not from notify', async () => {
  const config = textConfig({ modal: '#signupModal' });
  config.steps[0].rows[0].fields.push({
    name: 'captcha',
    type: 'widgets',
    widget: 'captcha',
    element_id: 'human_check',
    action: 'signup_verify',
    token: 'signup-token',
  });
  const { window, document } = mountModal({ config });
  window.turnstile = {};
  const mounted = [];
  const Captcha = {
    enabled: () => true,
    isLocal: () => false,
    solved: () => true,
    token: () => 'tok-123',
    mount: (selector, action) => mounted.push({ selector, action }),
    unmount: () => {},
  };
  const calls = [];
  const handle = bootModal(document, {
    name: 'signup',
    Captcha,
    fetch: okFetch(calls),
    setTimeout: () => 0,
  });
  assert.ok(handle);

  document.getElementById('signupModal').dispatchEvent(new window.Event('shown.bs.modal'));
  assert.deepEqual(mounted, [{ selector: '#human_check-widget', action: 'signup_verify' }]);

  handle.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body['signup-token'], 'tok-123');
});

test('legacy notify ids still boot as a compatibility fallback', async () => {
  const config = {
    version: 1,
    id: 'notify',
    theme: 'bootstrap4',
    behavior: { mode: 'modal', modal: '#notifyModal' },
    submit: { action: '/api/notify' },
    steps: [{ id: 'main', rows: [{ fields: [{ name: 'ref', type: 'text', label: 'Ref' }] }] }],
  };
  const { document } = mountModal({ name: 'notify', config, legacy: true });
  const calls = [];
  const handle = bootModal(document, { Captcha: null, fetch: okFetch(calls), setTimeout: () => 0 });

  assert.ok(handle, 'the notify form must keep booting without an explicit name');
  assert.equal(handle.name, 'notify');
  handle.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(); await flush();
  assert.equal(calls.length, 1);
  assert.ok(!document.getElementById('notify-success').classList.contains('d-none'));
});

test('a generic config never falls back to notify ids', () => {
  const { document } = mountModal({ config: textConfig({ modal: '#signupModal' }), legacy: true });
  assert.equal(bootModal(document, { name: 'other', Captcha: null }), null);
});
