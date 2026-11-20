// MOD-14 regression: the add-property gate must describe the contract, not
// name the fields that happen to implement it today.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml } from '../tools/yaml.mjs';
import { structureChecks } from '../tools/check-add-property-core.mjs';
import { FormRender } from '../runtime/render.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'adapters', 'jekyll', 'test', 'fixtures', 'add-property.yml');
const RENAMES = {
  district_settlement: 'microdistrict_pick',
  type_address: 'address_kind',
  location_widget: 'place_picker',
};

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
