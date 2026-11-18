import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHTML } from 'linkedom';

import { FormRender } from '../runtime/render.js';
import { buildData } from '../runtime/data.js';
import { bootPage as wireFormPageImpl } from '../runtime/page-form.js';

// Stub the captcha watcher's timer seam so no real interval outlives the test.
const wireFormPage = (document, opts = {}) => wireFormPageImpl(document, { setInterval: () => 0, ...opts });

// A brand-new form, nothing to do with add-property: proves the same glue
// drives every config the engine renders (generic discovery + submit).
const config = {
  version: 1,
  id: 'demo',
  settings: { title: 'Демо' },
  submit: { action: '/api/demo' },
  steps: [
    { id: 's1', title: 'Крок 1', rows: [{ class: 'row', fields: [
      { name: 'full_name', type: 'text', label: 'Імʼя' },
      { name: 'email', type: 'email', label: 'Email' },
    ] }] },
  ],
};

function mount(override = {}) {
  const mounted = { ...config, ...override };
  const island = JSON.stringify({ settings: mounted.settings, steps: mounted.steps, rates: {} })
    .replace(/</g, '\\u003c').replace(/&/g, '\\u0026');
  const baked = FormRender.render(mounted, { data: buildData(mounted) });

  const html = `<!doctype html><html><body>
    <script id="demo-config" type="application/json">${island}</script>
    <div id="demo-app" data-endpoint="/api/demo">${baked}</div>
    <div class="step-indicator" data-step-indicator></div>
    <button data-step-prev hidden></button><button data-step-next></button><button data-submit hidden></button>
    <div data-submitted-block hidden></div><div data-error-block hidden></div>
    <p data-error-text></p><p data-error-code-wrap hidden><span data-error-code></span></p>
  </body></html>`;

  const { window } = parseHTML(html);
  globalThis.window = window;
  globalThis.document = window.document;
  return { window, document: window.document };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('a non-add-property config boots through the same page glue', () => {
  const { document } = mount();
  const app = wireFormPage(document, { name: 'demo' });
  assert.ok(app, 'wireFormPage must boot a generic form');
  assert.ok(app.controller, 'the controller must be exposed');
  assert.equal(document.getElementById('demo-form') !== null, true);
});

test('discovery without an explicit name finds the config island', () => {
  const { document } = mount();
  const app = wireFormPage(document, {});
  assert.ok(app, 'wireFormPage must discover the *-config island on its own');
});

test('the generic submit posts the form data as FormData to the endpoint', async () => {
  const { window, document } = mount();
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  };

  const app = wireFormPage(document, { name: 'demo', fetch: fetchImpl, leaflet: null, Captcha: null });
  app.controller.setData('full_name', 'Іван');

  const submit = document.querySelector('[data-submit]');
  submit.dispatchEvent(new window.Event('click', { bubbles: true }));
  await flush(); await flush();

  assert.equal(calls.length, 1, 'exactly one submit request');
  assert.equal(calls[0].url, '/api/demo');
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.body instanceof window.FormData, 'body is FormData');
  assert.match(calls[0].init.body.get('data') || '', /Іван/);
});

test('hovering an autocomplete result repaints in place and leaves it clickable', async () => {
  const { window, document } = mount({
    steps: [{ id: 's1', title: 'Крок 1', rows: [{ class: 'row', fields: [
      { name: 'street', type: 'autocomplete', label: 'Вулиця', minChars: 1, threshold: 1,
        data: [{ id: 'lane', name: 'провулок' }, { id: 'road', name: 'дорога' }] },
    ] }] }],
  });
  // linkedom exposes control.value as getter-only; the glue writes both on sync.
  for (const sel of document.querySelectorAll('select')) {
    const proto = Object.getPrototypeOf(sel);
    if (!Object.getOwnPropertyDescriptor(proto, 'value').set) {
      Object.defineProperty(proto, 'value', {
        configurable: true,
        get() {
          const o = (this.options || []).find((x) => x.selected) || (this.options || [])[this.selectedIndex] || null;
          return o ? o.getAttribute('value') : '';
        },
        set(v) {
          const opts = this.options || [];
          for (const o of opts) o.selected = o.getAttribute && o.getAttribute('value') === String(v);
        },
      });
    }
  }
  const search = document.querySelector('[data-autocomplete-search="street"]');
  let typed = '';
  Object.defineProperty(search, 'value', {
    configurable: true,
    get: () => typed,
    set: (v) => { typed = String(v); },
  });

  const app = wireFormPage(document, { name: 'demo', leaflet: null, Captcha: null });
  assert.ok(app, 'wireFormPage must boot');

  const dropdown = document.querySelector('[data-autocomplete-dropdown="street"]');
  assert.ok(search && dropdown, 'the autocomplete chrome must be mounted');

  search.dispatchEvent(new window.Event('focus'));
  search.value = 'пр';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();

  const item = Array.prototype.find.call(
    dropdown.querySelectorAll('.dropdown-item'),
    (el) => el.textContent.includes('провулок')
  );
  assert.ok(item, 'the result must be offered');

  item.dispatchEvent(new window.Event('mouseenter'));
  assert.equal(dropdown.querySelector('.dropdown-item'), item,
    'hover must not replace the node under the pointer (that loops in Chromium)');
  assert.equal(item.classList.contains('highlighted'), true, 'the hovered result is highlighted');
  assert.equal(item.getAttribute('aria-selected'), 'true', 'the hovered result is selected for AT');
  assert.equal(search.getAttribute('aria-activedescendant'), item.id, 'the input points at the hovered result');

  item.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
  assert.equal(app.controller.getValue('street'), 'lane', 'a mouse pick still stores the value');
});
