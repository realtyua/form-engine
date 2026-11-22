// FormEngine build-time page shell.
//
// Renders the whole page fragment for one form as one HTML string:
//
//   config island -> captcha -> map css -> engine css -> wizard chrome
//   -> the baked form -> chrome tail -> addon modals -> map js -> module loader
//
// It is a pure function of (config, opts): no DOM, no globals, no templating
// language. Jekyll and Eleventy therefore bake the identical block, and a form
// looks and behaves the same on both. The Liquid shell it replaces
// (_includes/form/app/shell.html) is gone.
//
// Everything site specific - URLs, currency rates, Ukrainian copy, the inline
// Leaflet/map/style assets - arrives in `opts` from the adapter (the Jekyll
// plugin, the Eleventy plugin, or _form-engine/tools/site-opts.mjs for a manual run). A
// config never carries them, which is what keeps one form independent from the
// site it lives on and from every other form.

import { attr } from './html.js';
import { collectModals } from './modals.js';
import { FormRender } from './render.js';
import { buildData } from './data.js';
import { themeStyle } from './themes/themeStyle.js';

/** Chrome copy used when neither the adapter nor the config supplies any. */
const DEFAULT_COPY = {
  previous: 'Попереднє',
  next: 'Наступне',
  submit: 'Надіслати',
  sending: 'Надсилаю',
  successTitle: 'Оголошення надіслано',
  successText: 'Дякуємо!',
  errorTitle: 'Не вдалося надіслати оголошення',
  errorCode: 'Код помилки',
  retry: 'Спробувати ще раз',
  close: 'Закрити',
};

/** Which optional widget families a config uses, so the shell loads their assets. */
export function widgetFlags(config) {
  const flags = { map: false, captcha: false, file: false };
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.widget === 'map') flags.map = true;
    if (node.widget === 'captcha') flags.captcha = true;
    if (node.type === 'file') flags.file = true;
    for (const value of Object.values(node)) walk(value);
  };
  walk(config);
  return flags;
}

// A `<script type="application/json">` block is raw text until the parser hits
// `</script>`, so `<` has to leave as an escape - a label containing "</script>"
// would otherwise close the island early. The line separators are invalid in a
// JS string body in old engines, so they go too.
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function islandScript(name, island) {
  return `<script id="${attr(name)}-config" type="application/json">\n${safeJson(island)}\n</script>`;
}

function turnstileBlock(turnstile, captchaUrl, version) {
  const config = {
    enabled: turnstile.enabled === true,
    sitekey: turnstile.sitekey ?? '',
    language: turnstile.language ?? 'uk-ua',
    retryInterval: turnstile.retryInterval ?? 8000,
    maxRetries: turnstile.maxRetries ?? 3,
    localHosts: turnstile.localHosts ?? [],
  };
  return `<script>\n  window.TURNSTILE_CONFIG = ${safeJson(config)};\n</script>\n` +
    `<script src="${attr(captchaUrl)}${version}"></script>\n` +
    `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>`;
}

function resolveContext(config, opts = {}) {
  if (!config || typeof config !== 'object') {
    throw new Error('render needs a parsed config object');
  }
  const name = opts.name || config.id;
  if (!name) throw new Error('render needs opts.name or a config id');

  const themeName = config.theme || opts.theme || 'bootstrap4';
  const theme = FormRender.theme(themeName);
  const flags = widgetFlags(config);
  const assets = config.assets || {};

  const base = assets.base ?? opts.base ?? '';
  const url = (path) => `${base}${path}`;
  const version = opts.version ? `?v=${encodeURIComponent(opts.version)}` : '';
  const scriptUrl = url(assets.script || '/assets/js/form-engine/app.js');
  const captchaUrl = url(assets.captchaScript || '/assets/js/form-engine/captcha.js');

  const endpoint = opts.endpoint || (config.submit && config.submit.action) || '';
  const copy = { ...DEFAULT_COPY, ...(opts.copy || {}), ...(config.chrome || {}) };
  const turnstile = config.captcha || opts.turnstile || null;
  const rates = config.rates || opts.rates || {};

  return {
    name,
    themeName,
    theme,
    flags,
    assets,
    base,
    url,
    version,
    scriptUrl,
    captchaUrl,
    endpoint,
    copy,
    turnstile,
    rates,
  };
}

/**
 * Shared gate for captcha assets: emits TURNSTILE_CONFIG, captcha.js and
 * Turnstile api.js once when the config uses a captcha widget and Turnstile is
 * enabled. Used by both page and modal fragments.
 */
export function renderAssets(config, opts = {}) {
  const ctx = resolveContext(config, opts);
  const { flags, turnstile, captchaUrl, version } = ctx;
  if (turnstile && turnstile.enabled && flags.captcha) {
    return turnstileBlock(turnstile, captchaUrl, version);
  }
  return '';
}

/**
 * Renders one form page fragment.
 *
 * @param {object} config parsed form config (see _form-engine/schema)
 * @param {object} [opts]
 * @param {string} [opts.name]        form id; defaults to config.id
 * @param {string} [opts.theme]       overrides config.theme; default bootstrap4
 * @param {object} [opts.data]        form values for conditional copy
 * @param {string} [opts.endpoint]    submit URL; falls back to config.submit.action
 * @param {string} [opts.base]        URL prefix (site baseurl), e.g. "" or "/site"
 * @param {string} [opts.version]     cache-busting token appended as ?v=
 * @param {object} [opts.rates]       {usd, eur, nbu} for the price widgets
 * @param {object} [opts.turnstile]   Turnstile settings; config.captcha wins
 * @param {object} [opts.copy]        chrome copy; config.chrome wins
 * @param {string} [opts.mapCss]      Leaflet CSS, inlined when the form has a map
 * @param {string} [opts.mapJs]       Leaflet JS, inlined when the form has a map
 * @returns {string}
 */
export function renderPage(config, opts = {}) {
  const ctx = resolveContext(config, opts);
  const { name, themeName, theme, flags, version, scriptUrl, endpoint, copy, turnstile, captchaUrl, rates } = ctx;

  const island = {
    theme: themeName,
    behavior: config.behavior || {},
    settings: config.settings || {},
    steps: config.steps || [],
    rates,
    // The browser needs the same action contract the builder used for chrome.
    chrome: { ...copy, nav: theme.navTokens },
  };

  const formHtml = FormRender.render(config, {
    theme: themeName,
    data: opts.data || buildData(config),
  });
  const chrome = theme.chrome({ steps: config.steps || [], copy });
  const modals = theme.modals(collectModals(config), copy);

  const parts = [islandScript(name, island)];

  const captcha = turnstile && turnstile.enabled && flags.captcha
    ? turnstileBlock(turnstile, captchaUrl, version)
    : '';
  if (captcha) parts.push(captcha);
  if (flags.map && opts.mapCss) parts.push(`<style>${opts.mapCss}</style>`);
  const style = themeStyle(themeName);
  if (style) parts.push(`<style>${style}</style>`);

  const body = [
    `<div id="${attr(name)}-page" data-form-page>`,
    chrome.top,
    '',
    `<div id="${attr(name)}-app" data-endpoint="${attr(endpoint)}">`,
    formHtml,
    '</div>',
    '',
    chrome.bottom,
  ];
  if (modals) body.push('', modals);
  body.push('</div>');
  parts.push(body.join('\n'));

  if (flags.map && opts.mapJs) parts.push(`<script>${opts.mapJs}</script>`);
  parts.push(`<script type="module" src="${attr(scriptUrl)}${version}"></script>`);

  return parts.join('\n');
}

/**
 * Renders a modal form fragment: config island + captcha assets (once, when
 * applicable) + theme style + empty mount point + module loader. No wizard
 * chrome and no pre-rendered form markup (the modal runtime mounts the form).
 */
export function renderModal(config, opts = {}) {
  const ctx = resolveContext(config, opts);
  const { name, themeName, theme, version, scriptUrl, endpoint, rates, copy } = ctx;

  const island = {
    id: config.id || name,
    version: config.version,
    behavior: config.behavior,
    theme: themeName,
    settings: config.settings || {},
    steps: config.steps || [],
    rates,
    chrome: { ...copy, nav: theme.navTokens },
  };

  const parts = [islandScript(name, island)];
  const captcha = renderAssets(config, opts);
  if (captcha) parts.push(captcha);
  const style = themeStyle(themeName);
  if (style) parts.push(`<style>${style}</style>`);
  parts.push(`<div id="${attr(name)}-app" data-endpoint="${attr(endpoint)}"></div>`);
  parts.push(`<script type="module" src="${attr(scriptUrl)}${version}"></script>`);
  return parts.join('\n');
}

export default renderPage;
