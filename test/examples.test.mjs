// Offline contract gate for the two example sites (PUB-7).
//
// It never touches the network and never installs anything: the Jekyll side
// runs the generator the example ships, the Eleventy side runs the example
// adapter against a fake eleventyConfig. Because both examples carry their own
// runtime and adapter, this also proves they are self-contained.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml } from '../tools/yaml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JEKYLL = join(ROOT, 'examples', 'jekyll');
const ELEVENTY = join(ROOT, 'examples', 'eleventy');
const require = createRequire(import.meta.url);

const JEKYLL_CONFIG = join(JEKYLL, '_data', 'demo.yml');
const ELEVENTY_CONFIG = join(ELEVENTY, 'src', '_data', 'demo.yml');
const JEKYLL_BAKED = join(JEKYLL, '_includes', 'form', 'app', 'demo.html');

function node(args, cwd = ROOT) {
  return execFileSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

test('both examples are self-contained (own runtime + adapter)', () => {
  assert.ok(existsSync(join(JEKYLL, 'assets', 'js', 'form-engine', 'shell.js')), 'Jekyll runtime');
  assert.ok(existsSync(join(JEKYLL, 'assets', 'js', 'form-engine', 'app.js')), 'Jekyll entry');
  assert.ok(existsSync(join(JEKYLL, '_plugins', 'form_engine.rb')), 'Jekyll plugin');
  assert.ok(existsSync(join(JEKYLL, '_form-engine', 'tools', 'gen-form-app.mjs')), 'Jekyll bake tool');

  assert.ok(existsSync(join(ELEVENTY, 'src', 'assets', 'js', 'form-engine', 'shell.js')), '11ty runtime');
  assert.ok(existsSync(join(ELEVENTY, 'src', 'assets', 'js', 'form-engine', 'app.js')), '11ty entry');
  assert.ok(existsSync(join(ELEVENTY, 'lib', 'form-engine.js')), '11ty adapter');
});

test('both demo configs validate against the package schema (--strict)', () => {
  for (const target of ['examples/jekyll/_data/demo.yml', 'examples/eleventy/src/_data/demo.yml']) {
    const out = node([join(ROOT, 'tools', 'validate-config.mjs'), target, '--strict']);
    assert.match(out, /valid \(schema version 1, id "demo"\)/, target);
    assert.doesNotMatch(out, /^\s*\? /m, `${target} has keys outside the schema`);
  }
});

test('the demo configs are version 1, id "demo", one per theme', () => {
  const jekyll = loadYaml(JEKYLL_CONFIG);
  const eleventy = loadYaml(ELEVENTY_CONFIG);

  for (const config of [jekyll, eleventy]) {
    assert.equal(config.version, 1);
    assert.equal(config.id, 'demo');
    assert.ok(Array.isArray(config.steps) && config.steps.length >= 1);
  }
  assert.equal(jekyll.theme, 'bootstrap4');
  assert.equal(eleventy.theme, 'tailwind');
});

test('the Jekyll example bakes a self-contained demo fragment', () => {
  node(
    [
      join(JEKYLL, '_form-engine', 'tools', 'gen-form-app.mjs'),
      '--name', 'demo',
      '--data', '_data/demo.yml',
      '--out', '_includes/form/app/demo.html',
    ],
    JEKYLL,
  );

  const baked = readFileSync(JEKYLL_BAKED, 'utf8');
  assert.match(baked, /^<!-- form-bake name=demo sha=[0-9a-f]{64} -->/);
  assert.match(baked, /<div id="demo-page" data-form-page>/);
  assert.match(baked, /<form id="demo-form" method="POST" novalidate autocomplete="off" data-form="demo">/);
  assert.match(baked, /<script id="demo-config" type="application\/json">/);
  assert.match(baked, /"theme":"bootstrap4"/);
  assert.match(baked, /data-endpoint="\/api\/demo"/);
  assert.match(baked, /<script type="module" src="[^"]*form-engine\/app\.js[^"]*"><\/script>/);
  assert.doesNotMatch(baked, /\{\{|\{%/, 'a baked Jekyll include must stay free of Liquid delimiters');
});

test('the Jekyll demo page opts into the baked fragment', () => {
  const page = readFileSync(join(JEKYLL, 'demo.html'), 'utf8');
  assert.match(page, /\{%\s*include\s+form\/app\/demo\.html\s*%\}/);
});

test('the Eleventy example registers {% formApp "demo" %} and returns the fragment', async () => {
  const registerForms = require(join(ELEVENTY, 'lib', 'form-engine.js'));

  const handlers = {};
  const shortcodes = {};
  const fake = {
    globalData: {},
    on(event, fn) { handlers[event] = fn; },
    addShortcode(name, fn) { shortcodes[name] = fn; },
    addWatchTarget() {},
  };

  registerForms(fake);
  assert.equal(typeof handlers.beforeBuild, 'function', 'adapter hooks beforeBuild');
  assert.equal(typeof shortcodes.formApp, 'function', 'adapter registers formApp');

  await handlers.beforeBuild();

  const html = shortcodes.formApp('demo');
  assert.match(html, /<div id="demo-page" data-form-page>/);
  assert.match(html, /<form id="demo-form" method="POST" novalidate autocomplete="off" data-form="demo">/);
  assert.match(html, /<script id="demo-config" type="application\/json">/);
  assert.match(html, /"theme":"tailwind"/);
  assert.match(html, /data-endpoint="\/api\/demo"/);
  assert.match(html, /<script type="module" src="[^"]*form-engine\/app\.js[^"]*"><\/script>/);

  assert.throws(() => shortcodes.formApp('missing'), /no src\/_data\/missing\.yml/);
});

test('the Eleventy demo page mounts the shortcode', () => {
  const page = readFileSync(join(ELEVENTY, 'src', 'demo.njk'), 'utf8');
  assert.match(page, /\{%\s*formApp\s+"demo"\s*%\}/);
});
