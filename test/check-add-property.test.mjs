// MOD-14 regression: the add-property gate must describe the contract, not
// name the fields that happen to implement it today.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml } from '../tools/yaml.mjs';
import {
  copyChecks,
  extractFormSlice,
  normalize,
  structureChecks,
} from '../tools/check-add-property-core.mjs';
import { FormRender } from '../runtime/render.js';
import { inlineMarkdown } from '../runtime/html.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'adapters', 'jekyll', 'test', 'fixtures', 'add-property.yml');
const BASELINE = join(ROOT, 'adapters', 'jekyll', 'test', 'fixtures', 'add-property.html');
const RENAMES = {
  district_settlement: 'microdistrict_pick',
  type_address: 'address_kind',
  location_widget: 'place_picker',
};

function renameWidget(value, from, to) {
  if (typeof value === 'string') return value === from ? to : value;
  if (Array.isArray(value)) return value.map((item) => renameWidget(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameWidget(item, from, to)]));
  }
  return value;
}

function renameValue(value) {
  if (typeof value === 'string') {
    let out = value;
    for (const [from, to] of Object.entries(RENAMES)) {
      out = out.split(`${from}.`).join(`${to}.`);
      if (out === from) out = to;
    }
    return out;
  }
  if (Array.isArray(value)) return value.map(renameValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameValue(item)]));
  }
  return value;
}

test('autocomplete and location expectations survive renamed config fields', () => {
  const config = renameValue(loadYaml(FIXTURE));
  const html = FormRender.render(config);
  const failures = structureChecks(config, html).filter(({ ok }) => !ok);

  assert.deepEqual(
    failures.map(({ label }) => label),
    [],
    'the gate must still pass after the autocomplete/location fields are renamed',
  );

  const labels = structureChecks(config, html).map(({ label }) => label);
  assert.ok(labels.includes('autocomplete search hook: microdistrict_pick'));
  assert.ok(labels.includes('autocomplete search hook: address_kind'));
  assert.ok(labels.includes('location select name: place_picker.oblast'));
  assert.ok(labels.includes('location summary: place_picker.settlement'));

  // The fixture really did change: the old names must be gone from the render.
  assert.doesNotMatch(html, /field_district_settlement|field_type_address|field_location_widget_/);
});

test('no gate wrapper hard-codes the retired field names', () => {
  const sources = [
    'tools/check-add-property.mjs',
    'tools/check-add-property-core.mjs',
    'adapters/jekyll/tools/check-add-property.mjs',
    'adapters/eleventy/tools/check-add-property.mjs',
  ];
  for (const relative of sources) {
    const source = readFileSync(join(ROOT, relative), 'utf8');
    for (const banned of Object.keys(RENAMES)) {
      assert.ok(
        !source.includes(banned),
        `${relative} must not mention ${banned} (derive it from the config instead)`,
      );
    }
  }
});

test('config-derived widget ids are not orphans, foreign ids still are (MOD-18)', () => {
  const config = renameWidget(loadYaml(FIXTURE), 'map_widget', 'map_pin');
  const baselineSlice = normalize(
    extractFormSlice(readFileSync(BASELINE, 'utf8').replace(/^\uFEFF/, '')),
    { alpine: true, dataAttr: false },
  );
  const html = FormRender.render(config);

  assert.match(html, /id="map_pin-picker"/);
  assert.doesNotMatch(html, /id="map-picker"/);

  const failures = (markup) => copyChecks(config, markup, baselineSlice, inlineMarkdown)
    .filter(({ ok }) => !ok)
    .map(({ label }) => label);

  assert.deepEqual(failures(html), [], 'the renamed picker id must be derived from the config, not reported as an orphan');

  const withForeignId = html.replace('</form>', '<div id="unexpected-foreign-id"></div></form>');
  assert.ok(
    failures(withForeignId).some((label) => label.includes('unexpected-foreign-id')),
    'an id no config widget owns must still fail the orphan check',
  );
});
