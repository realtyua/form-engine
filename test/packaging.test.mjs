// Packaging contract for the published package.
//
// The engine itself is covered by the runtime suite. This file only guards the
// package boundary: name, version, `exports`, `files` and the changelog must
// agree with the files that actually ship, and the declared entry points must
// resolve. It has no dependency on a host site, so it runs in the bare repo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const exists = (relative) => existsSync(resolve(ROOT, relative));

test('package identity is stable', () => {
  assert.equal(pkg.name, 'form-engine');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'MIT');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.private, true, 'private stays true until PUB-10 decides the release channel');
});

test('every exports target exists in the package', () => {
  assert.ok(pkg.exports, 'package.json must declare exports');
  for (const [key, target] of Object.entries(pkg.exports)) {
    assert.equal(typeof target, 'string', `exports["${key}"] must be a string target`);
    assert.ok(target.startsWith('./'), `exports["${key}"] must be a relative path`);
    // A subpath pattern maps to a directory prefix; an exact entry maps to a file.
    const base = target.endsWith('*') ? target.slice(0, -1) : target;
    assert.ok(exists(base), `exports["${key}"] -> ${target} does not exist`);
  }
});

test('every files entry exists in the package', () => {
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'package.json must declare files');
  for (const entry of pkg.files) {
    assert.ok(exists(entry), `files entry "${entry}" does not exist`);
  }
  assert.ok(pkg.files.includes('CHANGELOG.md'), 'CHANGELOG.md must ship');
});

test('the version matches the newest changelog release', () => {
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const releases = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
  assert.ok(releases.length > 0, 'CHANGELOG.md has no release headings');
  assert.equal(releases[0], 'Unreleased', 'the first changelog heading must be [Unreleased]');
  const newest = releases.find((v) => v !== 'Unreleased');
  assert.equal(newest, pkg.version, 'the newest changelog release must equal package.version');
  assert.match(changelog, new RegExp(`^## \\[${pkg.version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));
});

test('the declared entry points resolve', async () => {
  const entry = await import('form-engine');
  assert.equal(typeof entry.boot, 'function', 'the package root must expose boot()');

  const render = await import('form-engine/runtime/render.js');
  assert.equal(typeof render.FormRender.render, 'function', 'runtime/render.js must be importable');

  const schema = JSON.parse(readFileSync(join(ROOT, 'schema/form-config.schema.json'), 'utf8'));
  assert.equal(typeof schema, 'object', 'the schema export must be readable JSON');
});
