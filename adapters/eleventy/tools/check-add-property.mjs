#!/usr/bin/env node
// Checks the add-property form against the Eleventy baseline.
//
//   node _form-engine/tools/check-add-property.mjs [--baseline _form-engine/baseline/add-property.html]
//
// The baseline is the frozen snapshot of the current Eleventy rendered form.
// The engine is a pure renderer that emits none of that - no Alpine, data-*
// hooks instead. The two cannot be byte-diffed, so this checker proves fidelity
// in three layers:
//
//   A. copy parity  - the static text the config drives (labels, helper
//                     text, placeholders, options, info lines) must also be in
//                     the engine output, after each side drops the attributes
//                     the other does not have;
//   B. structure     - the ids and classes the config drives (widget boxes,
//                     subfield selects, autocomplete search, file input) exist
//                     in the engine output with the exact shapes the partials
//                     use;
//   C. id contract   - every id the engine emits existed in the baseline, and
//                     every config field's control id does too.
//
// Pure Node: yml via js-yaml, the engine imported directly. All expectations
// live in the shared core module (MOD-14).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadYaml } from './yaml.mjs';
import { FormRender } from '../../src/assets/js/form-engine/render.js';
import { inlineMarkdown } from '../../src/assets/js/form-engine/html.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(ROOT, 'src', '_data', 'add-property.yml');

// The core ships at <package>/tools/. A site copy of this adapter lives in
// <site>/_form-engine/tools and consumes the installed package instead.
async function importCore() {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageTool = (pkg) => join(pkg, 'tools', 'check-add-property-core.mjs');
  const candidates = [
    join(here, 'check-add-property-core.mjs'),
    packageTool(join(ROOT, 'node_modules', '@realtyua', 'form-engine')),
    packageTool(join(process.cwd(), 'node_modules', '@realtyua', 'form-engine')),
    resolve(here, '..', '..', '..', 'tools', 'check-add-property-core.mjs'),
  ];
  for (const file of candidates) {
    if (existsSync(file)) return import(pathToFileURL(file).href);
  }
  throw new Error(`check-add-property-core.mjs not found (tried: ${candidates.join(', ')})`);
}
const { extractFormSlice, normalize, runCheckAddProperty } = await importCore();

const args = process.argv.slice(2);
const baselineFlag = args.indexOf('--baseline');
const baselinePath = resolve(
  ROOT,
  baselineFlag !== -1 ? args[baselineFlag + 1] : join('_form-engine', 'baseline', 'add-property-old.txt'),
);

if (!existsSync(CONFIG_PATH)) {
  console.error(`missing config: ${CONFIG_PATH}`);
  process.exit(2);
}
if (!existsSync(baselinePath)) {
  console.error(`missing baseline: ${baselinePath}`);
  process.exit(2);
}

const config = loadYaml(CONFIG_PATH);
const baselineSlice = normalize(
  extractFormSlice(readFileSync(baselinePath, 'utf8').replace(/^\uFEFF/, '')),
  { alpine: true, dataAttr: false },
);
const html = FormRender.render(config);
const checks = runCheckAddProperty({ config, html, baselineSlice, inlineMarkdown });

let failures = 0;
for (const { ok, label } of checks) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

console.log(failures === 0 ? '\ncheck-add-property: PASS' : `\ncheck-add-property: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
