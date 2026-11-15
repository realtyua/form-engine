import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures');

// Test that the adapter can be imported as ESM from the package
test('adapter imports as ESM without require errors', async () => {
  const { default: registerForms } = await import('../lib/form-engine.js');
  assert.equal(typeof registerForms, 'function');
});

// Test that registerForms works with minimal options (using fixtures)
test('registerForms bakes demo form with fixture data', async () => {
  const { default: registerForms } = await import('../lib/form-engine.js');

  // Mock eleventyConfig
  const globalData = {};
  const watchTargets = [];
  const shortcodes = {};
  const beforeBuildCallbacks = [];

  const eleventyConfig = {
    globalData,
    addWatchTarget: (target) => watchTargets.push(target),
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    on: (event, cb) => { if (event === 'beforeBuild') beforeBuildCallbacks.push(cb); },
  };

  // Call registerForms with fixture directories
  await registerForms(eleventyConfig, {
    siteDir: FIXTURES,
    dataDir: FIXTURES,
    engineDir: path.join(FIXTURES, '..', '..', '..', '..', 'runtime'),
    site: {
      demoEndpoint: '/api/demo',
      addPropertyEndpoint: '/api/add-property',
      notifyEndpoint: '/api/notify',
    },
  });

  // Run beforeBuild callbacks
  for (const cb of beforeBuildCallbacks) {
    await cb();
  }

  // Check that the demo form was baked
  assert.ok(shortcodes.formApp, 'formApp shortcode registered');
  assert.ok(shortcodes.formEngineVersion, 'formEngineVersion shortcode registered');
  assert.ok(shortcodes.notifyConfigIsland, 'notifyConfigIsland shortcode registered');
  assert.ok(shortcodes.notifyPageJson, 'notifyPageJson shortcode registered');

  // Test formApp shortcode
  const demoHtml = shortcodes.formApp('demo');
  assert.ok(demoHtml.includes('<form'), 'demo form HTML contains form tag');
  assert.ok(demoHtml.includes('id="demo-form"'), 'demo form has correct id');
  assert.ok(demoHtml.includes('data-form="demo"'), 'demo form has data-form attribute');

  // Test formEngineVersion shortcode
  const version = shortcodes.formEngineVersion();
  assert.ok(typeof version === 'string' && version.length > 0, 'version is a non-empty string');

  // Check watch targets
  assert.ok(watchTargets.some(t => t.includes('fixtures')), 'data directory watched');
  assert.ok(watchTargets.some(t => t.includes('runtime')), 'engine directory watched');
});

// Test that notifyConfigIsland works when notify form is present
test('notifyConfigIsland throws when notify not baked', async () => {
  const { default: registerForms } = await import('../lib/form-engine.js');

  const globalData = {};
  const shortcodes = {};
  const beforeBuildCallbacks = [];

  const eleventyConfig = {
    globalData,
    addWatchTarget: () => {},
    addShortcode: (name, fn) => { shortcodes[name] = fn; },
    on: (event, cb) => { if (event === 'beforeBuild') beforeBuildCallbacks.push(cb); },
  };

  // Use a fixture dir without notify.yml
  const testDir = path.join(FIXTURES, 'no-notify');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  await registerForms(eleventyConfig, {
    siteDir: FIXTURES,
    dataDir: testDir,
    engineDir: path.join(FIXTURES, '..', '..', '..', '..', 'runtime'),
    site: { demoEndpoint: '/api/demo' },
  });

  for (const cb of beforeBuildCallbacks) {
    await cb();
  }

  // Should throw when notify not baked
  assert.throws(() => shortcodes.notifyConfigIsland(), /notify form not baked/);
});