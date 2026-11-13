import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync, writeFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { loadYaml } from '../../../tools/yaml.mjs';
import { loadSiteOpts } from '../../../adapters/jekyll/tools/site-opts.mjs';
import { renderPage } from '../../../runtime/shell.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const BAKED = join(FIXTURES, 'add-property.html');

function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n');
}

function stripMarker(html) {
  return normalizeEol(html).replace(/^<!--\s*form-bake\b[^>]*-->\s*\n?/, '');
}

test('the baked add-property page has the expected structure', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'form-engine-bake-'));
  try {
    // Copy engine to the temp site root where site-opts expects it
    cpSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'runtime'), join(tmp, 'assets', 'js', 'form-engine'), { recursive: true });
    // Copy fixtures that site-opts reads
    cpSync(join(FIXTURES, '_config.yml'), join(tmp, '_config.yml'));
    cpSync(join(FIXTURES, '_data', 'uk.yml'), join(tmp, '_data', 'uk.yml'));
    cpSync(join(FIXTURES, '_includes', 'css', 'leaflet.css'), join(tmp, '_includes', 'css', 'leaflet.css'));
    cpSync(join(FIXTURES, '_includes', 'js', 'leaflet.js'), join(tmp, '_includes', 'js', 'leaflet.js'));
    // The config YAML
    cpSync(join(FIXTURES, 'add-property.yml'), join(tmp, '_data', 'add-property.yml'));

    const config = loadYaml(join(tmp, '_data', 'add-property.yml'));
    const siteOpts = loadSiteOpts(tmp, config);
    const fresh = renderPage(config, { ...siteOpts, name: 'add-property' });
    const baked = stripMarker(readFileSync(BAKED, 'utf8'));
    const freshStripped = stripMarker(normalizeEol(fresh));

    // Both should have the same structural elements (not byte-for-byte match since site data differs)
    assert.match(freshStripped, /<div id="add-property-page" data-form-page>/);
    assert.match(freshStripped, /<div id="add-property-app" data-endpoint="https:\/\/[^"]+">/);
    assert.match(freshStripped, /<form id="add-property-form" method="POST" novalidate autocomplete="off" data-form="add-property">/);
    assert.match(freshStripped, /<script id="add-property-config" type="application\/json">/);
    assert.match(freshStripped, /"theme":"bootstrap4"/);
    assert.match(freshStripped, /<script type="module" src="[^"]*form-engine\/app\.js[^"]*"><\/script>/);

    // The baked fixture should also have these (sanity check on the fixture)
    assert.match(baked, /<div id="add-property-page" data-form-page>/);
    assert.match(baked, /<div id="add-property-app" data-endpoint="https:\/\/[^"]+">/);
    assert.match(baked, /<form id="add-property-form" method="POST" novalidate autocomplete="off" data-form="add-property">/);
    assert.match(baked, /<script id="add-property-config" type="application\/json">/);
    assert.match(baked, /"theme":"bootstrap4"/);
    assert.match(baked, /<script type="module" src="[^"]*form-engine\/app\.js[^"]*"><\/script>/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the baked page wraps exactly one mountable form', () => {
  const baked = stripMarker(readFileSync(BAKED, 'utf8'));
  assert.match(baked, /<div id="add-property-page" data-form-page>/);
  assert.match(baked, /<div id="add-property-app" data-endpoint="https:\/\/[^"]+">/);
  assert.match(baked, /<form id="add-property-form" method="POST" novalidate autocomplete="off" data-form="add-property">/);
  const count = (baked.match(/<\/form>/g) || []).length;
  assert.equal(count, 1, 'exactly one closing form tag');
});

test('the baked page carries the config island and the module loader', () => {
  const baked = stripMarker(readFileSync(BAKED, 'utf8'));
  assert.match(baked, /<script id="add-property-config" type="application\/json">/);
  assert.match(baked, /"theme":"bootstrap4"/);
  assert.match(baked, /<script type="module" src="[^"]*form-engine\/app\.js[^"]*"><\/script>/);
});

test('the baked file carries the freshness marker the plugin reads', () => {
  const baked = readFileSync(BAKED, 'utf8');
  assert.match(baked, /^<!-- form-bake name=add-property sha=[0-9a-f]{64} -->/);
});

test('the baked page contains no Liquid delimiters (it renders as Liquid)', () => {
  const baked = stripMarker(readFileSync(BAKED, 'utf8'));
  assert.doesNotMatch(baked, /\{\{|\{%/, 'a baked fragment must not contain Liquid tags');
});

test('the shared page CSS does not force feedback blocks open before validation', () => {
  const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'runtime', 'themes', 'bootstrap4.css'), 'utf8');
  assert.doesNotMatch(page, /\.valid-feedback,\s*\.invalid-feedback\s*\{\s*display:\s*block/,
    'feedback visibility belongs to .is-valid/.is-invalid and the binder');
});