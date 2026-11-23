// MOD-15: one browser boot must serve page and modal forms. The profile comes
// from behavior.mode only; the form name, file name and field names stay generic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHTML } from 'linkedom';

import { boot } from '../runtime/app.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const formConfig = ({ id, mode, endpoint, fieldName, behavior = {} }) => ({
  version: 1,
  id,
  theme: 'bootstrap4',
  behavior: { mode, ...behavior },
  settings: { title: 'Generic intake' },
  submit: { action: endpoint },
  steps: [{
    id: 'main',
    rows: [{ fields: [{ name: fieldName, type: 'text', label: 'Reference' }] }],
  }],
});

function mountBoth() {
  const pageCfg = formConfig({
    id: 'alpha-intake', mode: 'page', endpoint: '/api/alpha', fieldName: 'alpha_ref',
  });
  const modalCfg = formConfig({
    id: 'beta-intake', mode: 'modal', endpoint: '/api/beta', fieldName: 'beta_ref',
    behavior: {
      modal: '#beta-dialog',
      seed: 'beta-intake-page',
      status: { error: '#beta-intake-error', success: '#beta-intake-success' },
      success: { hide: '#beta-intake-app', show: '#beta-intake-done' },
    },
  });
  const island = (config) => JSON.stringify(config).replace(/</g, '\\u003c');

  const html = `<!doctype html><html><body>
    <script id="alpha-intake-config" type="application/json">${island(pageCfg)}</script>
    <div id="alpha-intake-app" data-endpoint="/api/alpha"></div>
    <div class="modal" id="beta-dialog">
      <script id="beta-intake-config" type="application/json">${island(modalCfg)}</script>
      <script id="beta-intake-page" type="application/json">${island({ beta_ref: 'seed-17' })}</script>
      <div id="beta-intake-app" data-endpoint="/api/beta"></div>
      <div id="beta-intake-error" class="d-none"></div>
      <div id="beta-intake-success" class="d-none"></div>
      <div id="beta-intake-done" class="d-none"></div>
    </div>
  </body></html>`;

  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  return { window, document: window.document };
}

test('boot() dispatches two renamed forms by behavior.mode and submits both', async () => {
  const { window, document } = mountBoth();
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };

  const handles = boot(document, {
    Captcha: null,
    fetch: fetchImpl,
    setTimeout: () => 0,
    setInterval: () => 0,
    leaflet: null,
  });

  assert.equal(handles.length, 2, 'one boot finds both config islands');
  const page = handles.find((handle) => handle.name === 'alpha-intake');
  const modal = handles.find((handle) => handle.name === 'beta-intake');
  assert.ok(page && modal, 'both forms booted');
  assert.equal(page.mode, 'page');
  assert.equal(modal.mode, 'modal');

  page.controller.setData('alpha_ref', 'A-17');
  page.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  const pageCall = calls.find((call) => call.url === '/api/alpha');
  assert.ok(pageCall, 'the page profile posted to its own endpoint');
  assert.ok(pageCall.init.body instanceof window.FormData, 'the page body is FormData');
  assert.match(pageCall.init.body.get('data') || '', /A-17/);

  assert.equal(document.querySelector('[name="beta_ref"]').value, 'seed-17',
    'the modal profile seeded its own generic field');
  document.querySelector('[name="beta_ref"]').value = 'B-29';
  modal.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(); await flush();

  const modalCall = calls.find((call) => call.url === '/api/beta');
  assert.ok(modalCall, 'the modal profile posted to its own endpoint');
  assert.equal(modalCall.init.method, 'POST');
  assert.equal(JSON.parse(modalCall.init.body).beta_ref, 'B-29');
  assert.ok(!document.getElementById('beta-intake-success').classList.contains('d-none'),
    'the modal profile showed its own success hook');
});

test('the shared boot glue carries no production form, file or field literals', () => {
  const glue = [
    'runtime/form-runtime.js',
    'runtime/page-form.js',
    'runtime/modal-form.js',
    'runtime/widget-glue.js',
    'runtime/app.js',
  ];
  const forbidden = ['notify', 'add-property', 'add_property', 'images', 'location_widget', 'map_widget'];
  for (const relative of glue) {
    const source = readFileSync(join(ROOT, relative), 'utf8');
    for (const literal of forbidden) {
      assert.equal(source.includes(literal), false, `${relative} must not mention ${literal}`);
    }
  }
});
