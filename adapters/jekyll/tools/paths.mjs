import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function toolDir(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}

/**
 * Resolve the Jekyll site root for adapter tools.
 * - If tools live inside a site (e.g. <site>/_form-engine/tools), `<tools>/../..`
 *   contains `_config.yml` or `_data` → treat that as site root.
 * - Otherwise (tools consumed from the installed package), assume the current
 *   working directory is the site root.
 */
export function getSiteRoot(importMetaUrl) {
  const dir = toolDir(importMetaUrl);
  const local = resolve(dir, '..', '..');
  return existsSync(join(local, '_config.yml')) || existsSync(join(local, '_data'))
    ? local
    : process.cwd();
}

export function resolveSchemaPath(importMetaUrl) {
  const dir = toolDir(importMetaUrl);
  const siteRoot = getSiteRoot(importMetaUrl);
  const packageRoot = resolve(dir, '..', '..', '..'); // adapters/jekyll/tools -> package root
  const candidates = [
    join(siteRoot, '_form-engine', 'schema', 'form-config.schema.json'),
    join(packageRoot, 'schema', 'form-config.schema.json'),
    join(process.cwd(), '_form-engine', 'schema', 'form-config.schema.json'),
    join(process.cwd(), 'node_modules', '@realtyua', 'form-engine', 'schema', 'form-config.schema.json'),
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

export async function importRuntimeModule(importMetaUrl, relativeName) {
  const dir = toolDir(importMetaUrl);
  const siteRoot = getSiteRoot(importMetaUrl);
  const packageRoot = resolve(dir, '..', '..', '..');
  const candidates = [
    join(siteRoot, 'assets', 'js', 'form-engine', relativeName),
    join(packageRoot, 'runtime', relativeName),
    resolve(dir, '../../assets/js/form-engine', relativeName), // legacy compat
  ];
  for (const p of candidates) {
    if (existsSync(p)) return import(pathToFileURL(p).href);
  }
  // Last attempt keeps a deterministic failure path.
  return import(pathToFileURL(candidates[candidates.length - 1]).href);
}
