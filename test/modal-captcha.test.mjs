import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAssets, renderModal, renderPage } from '../runtime/shell.js';

const baseConfig = {
  version: 1,
  id: 'notify',
  theme: 'bootstrap4',
  behavior: { mode: 'modal' },
  settings: {},
  steps: [
    {
      id: 'form',
      rows: [
        {
          fields: [
            { name: 'reason', type: 'select', options: [{ value: 'a', label: 'A' }] },
            {
              name: 'captcha',
              type: 'widgets',
              widget: 'captcha',
              element_id: 'turnstile',
              action: 'notify_property',
            },
          ],
        },
      ],
    },
  ],
};

const turnstile = {
  enabled: true,
  sitekey: 'test-key',
  language: 'uk-ua',
  retryInterval: 8000,
  maxRetries: 3,
  localHosts: ['localhost'],
};

test('renderAssets emits captcha assets once when captcha widget and turnstile are enabled', () => {
  const html = renderAssets(baseConfig, { name: 'notify', turnstile });
  assert.match(html, /window\.TURNSTILE_CONFIG/);
  assert.match(html, /form-engine\/captcha\.js/);
  assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.equal((html.match(/window\.TURNSTILE_CONFIG/g) || []).length, 1);
  assert.equal((html.match(/form-engine\/captcha\.js/g) || []).length, 1);
  assert.equal((html.match(/api\.js\?render=explicit/g) || []).length, 1);
});

test('renderAssets returns empty when captcha widget is absent or turnstile disabled', () => {
  const noWidget = {
    ...baseConfig,
    steps: [{ id: 'form', rows: [{ fields: [{ name: 'x', type: 'text' }] }] }],
  };
  assert.equal(renderAssets(noWidget, { turnstile }), '');
  assert.equal(renderAssets(baseConfig, { turnstile: { ...turnstile, enabled: false } }), '');
});

test('renderModal emits config island, assets, mount point and app loader without wizard chrome', () => {
  const html = renderModal(baseConfig, { name: 'notify', endpoint: 'https://example.test/notify', turnstile });
  assert.match(html, /<script id="notify-config" type="application\/json">/);
  const island = html.match(/<script id="notify-config" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(island, 'missing notify-config island');
  const cfg = JSON.parse(island[1]);
  assert.equal(cfg.id, 'notify');
  assert.equal(cfg.version, 1);
  assert.deepEqual(cfg.behavior, { mode: 'modal' });
  assert.equal(cfg.theme, 'bootstrap4');
  assert.ok(Array.isArray(cfg.steps) && cfg.steps.length === 1);
  assert.match(html, /window\.TURNSTILE_CONFIG/);
  assert.match(html, /<script[^>]*src="[^"]*form-engine\/captcha\.js[^"]*"><\/script>/);
  assert.match(html, /<script[^>]*src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit"><\/script>/);
  assert.match(html, /<div id="notify-app" data-endpoint="https:\/\/example\.test\/notify"><\/div>/);
  assert.match(html, /<script type="module" src="[^"]*form-engine\/app\.js[^"]*"><\/script>/);
  assert.doesNotMatch(html, /data-form-page/);
  assert.doesNotMatch(html, /data-step-nav/);
  assert.doesNotMatch(html, /<form[\s>]/);
  assert.equal((html.match(/window\.TURNSTILE_CONFIG/g) || []).length, 1);
  assert.equal((html.match(/form-engine\/captcha\.js/g) || []).length, 1);
  assert.equal((html.match(/api\.js\?render=explicit/g) || []).length, 1);
});

test('renderPage keeps captcha assets once for page forms with captcha widget', () => {
  const html = renderPage(baseConfig, { name: 'notify', endpoint: 'https://example.test/notify', turnstile });
  assert.match(html, /data-form-page/);
  assert.match(html, /<form[\s>]/);
  assert.match(html, /window\.TURNSTILE_CONFIG/);
  assert.equal((html.match(/window\.TURNSTILE_CONFIG/g) || []).length, 1);
  assert.equal((html.match(/form-engine\/captcha\.js/g) || []).length, 1);
  assert.equal((html.match(/api\.js\?render=explicit/g) || []).length, 1);
});
