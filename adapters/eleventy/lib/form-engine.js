// FormEngine adapter for the Eleventy site.
//
// Same engine as the Jekyll site (assets/js/form-engine/**), same contract: a
// form config in src/_data/<name>.yml (the 11ty twin of Jekyll's
// _data/<name>.yml) is baked at build time into one self-contained fragment -
// config island, chrome, the rendered form, addon modals and the module loader
// (runtime/shell.js -> renderPage, runtime/app.js as the single entry).
//
// The difference is only how the fragment reaches the page. Jekyll writes a
// Liquid include; Nunjucks would re-parse that include and choke on the JSON,
// CSS and JS inside it. So here the fragment is kept in memory and injected by
// a shortcode whose return value Nunjucks never re-parses:
//
//   {% formApp "demo" %}
//
// The site data is not YAML, so - unlike _form-engine/tools/site-opts.mjs on
// the Jekyll side - this adapter passes its own opts and never reads a
// _config.yml. The config is site-agnostic; only this file knows the site.
//
// Like the Jekyll adapter it inlines the Leaflet blobs (src/assets/vendor/
// leaflet.{js,css}) when a form carries a map widget, so the map works without
// any network or extra <link>/<script> in the page layout.
//
// The adapter is published as part of @realtyua/form-engine and defaults to the
// package's runtime directory. A site can override engineDir, dataDir, siteDir
// and site (endpoints) via the options object passed to registerForms.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default paths. The engine directory defaults to the package's runtime (not the
// site's copy), so the adapter works when imported from the published package
// without requiring the site to copy the runtime first.
const DEFAULT_SITE_DIR = process.cwd();
const DEFAULT_DATA_DIR = path.join(DEFAULT_SITE_DIR, 'src', '_data');
const DEFAULT_ENGINE_DIR = path.join(__dirname, '..', '..', '..', 'runtime');

// Site-specific submit endpoints, keyed by form id. The config stays
// site-agnostic - it never carries a worker URL - so the adapter is the only
// place that knows where this site sends each form.
async function loadSiteConfig(siteDir) {
  const sitePath = path.join(siteDir, 'src', '_data', 'site.js');
  if (fs.existsSync(sitePath)) {
    const { default: site } = await import(pathToFileURL(sitePath).href);
    return site;
  }
  // Defaults for compatibility with reifua and other sites
  return {
    addPropertyEndpoint: '/api/add-property',
    demoEndpoint: '/api/demo',
    notifyEndpoint: '/api/notify',
  };
}

function pathToFileURL(filePath) {
  return new URL(`file://${filePath.replace(/\\/g, '/')}`);
}

function endpointFor(name, config, endpoints) {
  if (config.submit && config.submit.action) return config.submit.action;
  return endpoints[name];
}

// The same shape guard the Jekyll plugin uses: a file in _data is a form only
// when it carries the form signature. Everything else there (i18n, menu, ...)
// is left alone.
function isFormConfig(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    'version' in value && typeof value.id === 'string' && Array.isArray(value.steps);
}

// Site assets the bake inlines: the Leaflet blobs the map widget needs. They do
// not live in the engine dir (they are site files), so they are hashed and read
// here by explicit path - mirrors _includes/js|css on the Jekyll side.
const VENDOR_ASSETS = [
  'src/assets/vendor/leaflet.css',
  'src/assets/vendor/leaflet.js',
];

// Reads one bake asset (Leaflet CSS/JS) as UTF-8, or '' when missing.
function readVendor(rel, repo) {
  const full = path.join(repo, ...rel.split('/'));
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

// The ?v= token: a hash of the runtime the loader serves. Deterministic, so a
// rebuild of an unchanged engine keeps the same URL (browsers stay warm) and a
// changed engine busts it. Mirrors _form-engine/tools/site-opts.mjs engineDigest.
// The inlined Leaflet assets are part of the baked bytes, so they join the hash.
function engineDigest(engineDir, repo) {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
        hash.update(path.relative(engineDir, full).split(path.sep).join('/'));
        hash.update('\0');
        hash.update(fs.readFileSync(full));
        hash.update('\0');
      }
    }
  };
  walk(engineDir);
  for (const rel of VENDOR_ASSETS) {
    const full = path.join(repo, ...rel.split('/'));
    if (!fs.existsSync(full)) continue;
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(full));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

function formFiles(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();
}

// JSON for a <script type="application/json"> island: `<` has to leave as an
// escape (a label containing "</script>" would otherwise close the island
// early), and the line separators are invalid in a JS string body in old
// engines. The same contract as safeJson in the engine shell.
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export default async function registerForms(eleventyConfig, opts = {}) {
  const siteDir = opts.siteDir || DEFAULT_SITE_DIR;
  const dataDir = opts.dataDir || DEFAULT_DATA_DIR;
  const engineDir = opts.engineDir || DEFAULT_ENGINE_DIR;

  // Resolve site config
  const site = opts.site || await loadSiteConfig(siteDir);
  const endpoints = {
    'add-property': site.addPropertyEndpoint,
    'demo': site.demoEndpoint || '/api/demo',
    'notify': site.notifyEndpoint,
  };

  // name -> the rendered page fragment, and name -> the parsed config behind
  // it. The modal islands are serialized from the parsed configs, never
  // scraped back out of the baked HTML.
  const baked = new Map();
  const configs = new Map();

  // Baked after data is ready and before any template renders, so the
  // shortcode always finds its fragment. Eleventy watches src/_data and the
  // engine, so editing a config or the runtime re-bakes on the next rebuild.
  eleventyConfig.on('beforeBuild', async () => {
    baked.clear();
    configs.clear();
    if (!formFiles(dataDir).length) return;

    const { load: loadYaml } = await import('js-yaml');
    const { renderPage } = await import(pathToFileURL(path.join(engineDir, 'shell.js')).href);
    const version = engineDigest(engineDir, siteDir);

    // Expose version to templates for cache-busting the engine script.
    if (eleventyConfig.globalData) {
      eleventyConfig.globalData.formEngineVersion = version;
    }

    for (const file of formFiles(dataDir)) {
      const name = file.replace(/\.ya?ml$/, '');
      const config = loadYaml(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      if (!isFormConfig(config)) continue;
      if (config.id !== name) {
        throw new Error(`src/_data/${file}: id "${config.id}" must match the file name "${name}"`);
      }
      configs.set(name, config);
      baked.set(name, renderPage(config, {
        name,
        theme: config.theme,
        base: '',
        version,
        endpoint: endpointFor(name, config, endpoints),
        rates: config.rates,
        mapCss: readVendor('src/assets/vendor/leaflet.css', siteDir),
        mapJs: readVendor('src/assets/vendor/leaflet.js', siteDir),
      }));
    }
  });

  eleventyConfig.addShortcode('formApp', function formApp(name) {
    const html = baked.get(name);
    if (html === undefined) {
      const known = [...baked.keys()].join(', ') || 'none';
      throw new Error(`formApp("${name}"): no src/_data/${name}.yml (baked: ${known})`);
    }
    return html;
  });

  // Shortcode for the form engine version (cache-busting token).
  eleventyConfig.addShortcode('formEngineVersion', function formEngineVersion() {
    return (eleventyConfig.globalData && eleventyConfig.globalData.formEngineVersion) || '';
  });

  // Returns the config island JSON for the notify form (for the modal).
  // The island is the whole config file - id, version, behavior, settings,
  // steps - the same JSON the Jekyll twin ships with
  // `site.data.notify | jsonify`. The runtime reads behavior.mode to pick the
  // modal boot and config.id for the form contract, so the island cannot be
  // the derived {theme, settings, steps, rates, chrome} that renderPage bakes
  // into a page fragment: that one carries neither key, so the modal would
  // mount through the page glue as form "form".
  eleventyConfig.addShortcode('notifyConfigIsland', function notifyConfigIsland() {
    const config = configs.get('notify');
    if (!config) {
      throw new Error('notifyConfigIsland: notify form not baked');
    }
    return safeJson(config);
  });

  // Shortcode to generate the notify-page JSON island from page data.
  // Usage: {% notifyPageJson uid, pageUrl, email, title %} or with named args.
  eleventyConfig.addShortcode('notifyPageJson', function notifyPageJson(uid, pageUrl, email, title) {
    const data = {
      uid: uid || '',
      property_url: pageUrl || '',
      property_email: email || '',
      property_title: title || ''
    };
    return safeJson(data);
  });

  eleventyConfig.addWatchTarget(dataDir + path.sep);
  eleventyConfig.addWatchTarget(engineDir + path.sep);
}