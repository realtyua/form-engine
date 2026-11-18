// Smoke test for the Jekyll adapter tools that ship in the package.
//
// The tools are spawned the way a host site spawns them, from a directory that
// is not a site. That is enough to prove the module loads: a tool with a
// missing import dies while the module is evaluated, and no suite that only
// imports the runtime can see that. Version 1.0.2 shipped exactly that defect
// (`ReferenceError: resolve is not defined`), so the gate is now explicit.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(ROOT, 'adapters', 'jekyll', 'tools', 'check-add-property.mjs');

test('check-add-property loads and reports a missing site instead of crashing', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'form-engine-tool-'));
  try {
    try {
      execFileSync(process.execPath, [TOOL], { cwd, encoding: 'utf8', stdio: 'pipe' });
      assert.fail('the tool must not succeed outside a site');
    } catch (error) {
      assert.equal(
        error.status,
        2,
        `expected exit 2 (missing config), got ${error.status}: ${error.stderr}`
      );
      assert.match(String(error.stderr), /missing config/);
      assert.doesNotMatch(String(error.stderr), /ReferenceError|is not defined/);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
