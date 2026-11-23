// MOD-16: the example sites ship the same browser boot as the package. They
// stay self-contained, but their copies must not drift behind runtime/**, and
// a renamed form must work in both page and modal modes without any form,
// file or field literal in the glue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseHTML } from 'linkedom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = [
  { name: 'jekyll', runtime: join(ROOT, 'examples', 'jekyll', 'assets', 'js', 'form-engine') },
  { name: 'eleventy', runtime: join(ROOT, 'examples', 'eleventy', 'src', 'assets', 'js', 'form-engine') },
];
const FORBIDDEN = ['notify', 'add-property', 'add_property', 'images', 'location_widget', 'map_widget'];
const GLUE = ['app.js', 'form-runtime.js', 'page-form.js', 'modal-form.js', 'widget-glue.js'];
const flush = () => new Promise((resolveFlush) => setTimeout(resolveFlush, 0));

const boots = Object.fromEntries(await Promise.all(EXAMPLES.map(async (example) => {
  const module = await import(pathToFileURL(join(example.runtime, 'app.js')).href);
  return [example.name, module.boot];
})));

function source(relative) {
  return readFileSync(join(ROOT, relative), 'utf8');
}

function sharedFiles() {
  const runtime = join(ROOT, 'runtime');
  return readdirSync(runtime, { recursive: true })
    .map((relative) => relative.replaceAll('\\', '/'))
    .filter((relative) => !relative.endsWith('.gitkeep'))
    .filter((relative) => statSync(join(runtime, relative)).isFile());
}

function config(id, mode, endpoint, field) {
  return {
    version: 1,
    id,
    theme: 'bootstrap4',
    behavior: { mode },
    settings: { title: 'Generic intake' },
    submit: { action: endpoint },
    steps: [{
      id: 'main',
      rows: [{ fields: [{ name: field, type: 'text', label: 'Reference' }] }],
    }],
  };
}

function mountPair(prefix) {
  const pageName = `${prefix}-intake-page`;
  const modalName = `${prefix}-intake-modal`;
  const pageConfig = config(pageName, 'page', `/api/${prefix}-page`, `${prefix}_page_ref`);
  const modalConfig = config(modalName, 'modal', `/api/${prefix}-modal`, `${prefix}_modal_ref`);
  modalConfig.behavior.modal = `#${modalName}-dialog`;
  modalConfig.behavior.seed = `${modalName}-page`;
  modalConfig.behavior.status = {
    error: `#${modalName}-error`,
    success: `#${modalName}-success`,
  };
  modalConfig.behavior.success = {
    hide: `#${modalName}-app`,
    show: `#${modalName}-done`,
  };
  const island = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

  const html = `<!doctype html><html><body>
    <script id="${pageName}-config" type="application/json">${island(pageConfig)}</script>
    <div id="${pageName}-app" data-endpoint="/api/${prefix}-page"></div>
    <div class="modal" id="${modalName}-dialog">
      <script id="${modalName}-config" type="application/json">${island(modalConfig)}</script>
      <script id="${modalName}-page" type="application/json">${island({ [`${prefix}_modal_ref`]: `seed-${prefix}` })}</script>
      <div id="${modalName}-app" data-endpoint="/api/${prefix}-modal"></div>
      <div id="${modalName}-error" class="d-none"></div>
      <div id="${modalName}-success" class="d-none"></div>
      <div id="${modalName}-done" class="d-none"></div>
    </div>
  </body></html>`;

  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  return {
    window,
    document: window.document,
    pageName,
    modalName,
    pageField: `${prefix}_page_ref`,
    modalField: `${prefix}_modal_ref`,
  };
}

test('both example runtimes are byte-identical to the package runtime', () => {
  for (const relative of sharedFiles()) {
    for (const example of EXAMPLES) {
      const expected = readFileSync(join(ROOT, 'runtime', relative));
      const actual = readFileSync(join(example.runtime, relative));
      assert.deepEqual(actual, expected, `${example.name} copy of runtime/${relative} is stale`);
    }
  }
});

test('both example schemas match the package schema', () => {
  const expected = readFileSync(join(ROOT, 'schema', 'form-config.schema.json'));
  for (const relative of [
    'examples/jekyll/_form-engine/schema/form-config.schema.json',
  ]) {
    assert.deepEqual(readFileSync(join(ROOT, relative)), expected, `${relative} is stale`);
  }
});

test('both example boot glues delegate to the shared form-runtime and carry no production literals', () => {
  for (const example of EXAMPLES) {
    const entry = readFileSync(join(example.runtime, 'app.js'), 'utf8');
    assert.match(entry, /import\s*\{\s*bootForms\s*\}/, `${example.name} app.js must use bootForms`);
    assert.match(entry, /profiles:\s*\{\s*page:\s*pageProfile,\s*modal:\s*modalProfile\s*\}/,
      `${example.name} app.js must dispatch by profile`);
    for (const relative of GLUE) {
      const code = readFileSync(join(example.runtime, relative), 'utf8');
      for (const literal of FORBIDDEN) {
        assert.equal(code.includes(literal), false, `${example.name}/${relative} must not mention ${literal}`);
      }
    }
  }
});

for (const example of EXAMPLES) {
  test(`${example.name} example boots renamed page and modal forms through the shared runtime`, async () => {
    const prefix = `renamed-${example.name}`;
    const { window, document, pageName, modalName, pageField, modalField } = mountPair(prefix);
    const calls = [];
    const fetchImpl = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    };

    const handles = boots[example.name](document, {
      Captcha: null,
      fetch: fetchImpl,
      setTimeout: () => 0,
      setInterval: () => 0,
      leaflet: null,
    });

    assert.equal(handles.length, 2, 'one boot finds both config islands');
    const page = handles.find((handle) => handle.name === pageName);
    const modal = handles.find((handle) => handle.name === modalName);
    assert.ok(page && modal, 'both renamed forms booted');
    assert.equal(page.mode, 'page');
    assert.equal(modal.mode, 'modal');

    page.controller.setData(pageField, 'P-17');
    page.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush(); await flush();
    const pageCall = calls.find((call) => call.url === `/api/${prefix}-page`);
    assert.ok(pageCall, 'the renamed page form posts to its own endpoint');
    assert.ok(pageCall.init.body instanceof window.FormData, 'the page body is FormData');
    assert.match(pageCall.init.body.get('data') || '', /P-17/);

    assert.equal(document.querySelector(`[name="${modalField}"]`).value, `seed-${prefix}`,
      'the renamed modal form seeded its own field');
    document.querySelector(`[name="${modalField}"]`).value = 'M-29';
    modal.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush(); await flush();
    const modalCall = calls.find((call) => call.url === `/api/${prefix}-modal`);
    assert.ok(modalCall, 'the renamed modal form posts to its own endpoint');
    assert.equal(JSON.parse(modalCall.init.body)[modalField], 'M-29');
    assert.ok(!document.getElementById(`${modalName}-success`).classList.contains('d-none'),
      'the renamed modal form shows its own success hook');
  });
}
