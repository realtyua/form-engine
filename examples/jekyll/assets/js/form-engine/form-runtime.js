// Shared browser boot for every form the engine renders.
//
// Discovery, config parsing, mount, controller/binder, async checks, submit and
// events live here exactly once. A profile (page or modal, chosen from
// behavior.mode) supplies only its own chrome and response presentation. No
// form name, file name or field name is hard-coded: every id and selector is
// derived from the config island or from neutral data-* hooks.

import { FormRender } from './render.js';
import { makeController } from './controller.js';
import { bindForm } from './binder.js';
import { counterRemaining, findFieldInConfig, stepFieldNames } from './data.js';

const CONFIG_SUFFIX = '-config';
const DEFAULT_THEME = 'bootstrap4';

export function queryAll(node, selector) {
  return node && node.querySelectorAll
    ? Array.prototype.slice.call(node.querySelectorAll(selector))
    : [];
}

export function selectorList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export function escapeSelector(value) {
  const raw = String(value);
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
}

export function findById(root, id) {
  if (!root || !id) return null;
  if (typeof root.getElementById === 'function') return root.getElementById(id);
  if (!root.querySelector) return null;
  try { return root.querySelector(`#${escapeSelector(id)}`); } catch { return null; }
}

/** First node matching a config selector, a neutral hook or a derived id. */
export function findNode(root, selectors, fallbackIds = []) {
  const list = selectorList(selectors);
  for (const sel of list) {
    if (!root || !root.querySelector) continue;
    let node;
    try { node = root.querySelector(sel); } catch { continue; }
    if (node) return node;
  }
  for (const id of fallbackIds) {
    const node = findById(root, id);
    if (node) return node;
  }
  return null;
}

export function findNodes(root, selectors) {
  const out = [];
  for (const sel of selectorList(selectors)) {
    for (const node of queryAll(root, sel)) {
      if (out.indexOf(node) === -1) out.push(node);
    }
  }
  return out;
}

/** Fields of every step, independent of how the steps nest their rows. */
export function configFields(config) {
  const out = [];
  for (const step of (config && config.steps) || []) {
    for (const field of stepFieldNames(step)) out.push(field);
  }
  return out;
}

export function findWidgets(config, widget) {
  return configFields(config).filter((field) => field && field.type === 'widgets' && field.widget === widget);
}

export function captchaSelector(field) {
  const id = (field && (field.element_id || field.name)) || 'captcha';
  return `#${id}-widget`;
}

export function captchaTokenKey(field, config) {
  const configured = config.submit && config.submit.captcha && config.submit.captcha.token;
  return (field && field.token) || configured || 'cf-turnstile-response';
}

export function captchaAction(field, config, name) {
  const configured = config.submit && config.submit.captcha && config.submit.captcha.action;
  return (field && (field.action || field.captchaAction)) || configured || name;
}

export function captchaSolved(root, Captcha, field) {
  const selector = captchaSelector(field);
  if (root.querySelector && !root.querySelector(selector)) return true;
  return Boolean(Captcha && Captcha.solved && Captcha.solved(selector));
}

export function ensureStatusEl(form, kind) {
  const doc = form.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.createElement) return null;
  const div = doc.createElement('div');
  if (kind === 'error') {
    div.className = 'alert alert-danger d-none';
    div.setAttribute('role', 'alert');
    div.setAttribute('data-form-error', '');
  } else {
    div.className = 'alert alert-success d-none';
    div.setAttribute('role', 'alert');
    div.setAttribute('data-form-success', '');
  }
  form.appendChild(div);
  return div;
}

export function ensureSubmitButton(form, config) {
  let btn = form.querySelector('button[type="submit"], input[type="submit"]');
  if (btn) return btn;
  const doc = form.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.createElement) return null;
  btn = doc.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn-primary mt-2';
  btn.setAttribute('data-form-submit', '');
  const label = (config.settings && (config.settings.submitLabel || config.settings.submit)) ||
    (config.chrome && (config.chrome.submit || config.chrome.submitLabel)) ||
    (config.submit && (config.submit.label || config.submit.text)) ||
    'Надіслати';
  btn.textContent = label;
  form.appendChild(btn);
  return btn;
}

/** Discover one config island and everything the shared boot stages need. */
export function createContext(root, opts = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  const profile = opts.profile;
  if (!profile) throw new Error('form boot needs a profile');

  const explicitName = Boolean(opts.name);
  let name = opts.name || '';
  let configNode = explicitName ? findById(root, `${name}${CONFIG_SUFFIX}`) : null;
  // An explicit name is a strict request: never silently boot a different form.
  if (!explicitName && !configNode) {
    configNode = root.querySelector(`script[type="application/json"][id$="${CONFIG_SUFFIX}"]`);
  }
  if (!configNode) return null;
  if (!explicitName) name = configNode.id.slice(0, -CONFIG_SUFFIX.length);
  if (!name) return null;

  let config;
  try { config = JSON.parse(configNode.textContent); } catch { return null; }
  if (!config || typeof config !== 'object') return null;

  const mode = opts.mode || (config.behavior && config.behavior.mode) || 'page';
  const app = root.getElementById(`${name}-app`);
  if (!app) return null;

  const endpoint = app.getAttribute('data-endpoint') || (config.submit && config.submit.action) || '';
  const method = profile.submitMethod ? profile.submitMethod(config) : ((config.submit && config.submit.method) || 'POST');
  config.submit = { ...(config.submit || {}), method };
  if (endpoint) config.submit.action = endpoint;

  let form;
  try { form = FormRender.mount(app, config, { theme: config.theme }); } catch { return null; }
  if (!form) return null;

  const controller = makeController(config, profile.controllerOpts ? profile.controllerOpts(config) : {});
  const theme = FormRender.theme(config.theme || DEFAULT_THEME);
  const binder = bindForm(form, controller, { classes: theme.validationClasses, colClass: theme.colClass });

  return {
    root,
    name,
    mode,
    profile,
    configNode,
    config,
    app,
    form,
    controller,
    binder,
    data: controller.getData(),
    theme,
    endpoint,
    state: { submitted: false, submitting: false, submittingError: false },
    Captcha: opts.Captcha !== undefined
      ? opts.Captcha
      : (typeof window !== 'undefined' ? window.CaptchaSite || null : null),
    fetchImpl: opts.fetch || ((...args) => globalThis.fetch(...args)),
    later: opts.setTimeout || ((fn, ms) => setTimeout(fn, ms)),
    every: opts.setInterval || ((fn, ms) => setInterval(fn, ms)),
    now: opts.now || (() => Date.now()),
    L: opts.leaflet !== undefined
      ? opts.leaflet
      : (typeof window !== 'undefined' ? window.L || null : null),
    opts,
  };
}

/**
 * Async checks and counters shared by page and modal forms: email DNS findings
 * are page-layer errors, counters follow the field value from the controller.
 */
export function wireAsync(ctx) {
  const { config, controller, form, later } = ctx;
  const dnsTimers = {};
  const emailNames = configFields(config)
    .filter((field) => field && field.type === 'email')
    .map((field) => field.name);

  const checkEmailDomain = (name) => {
    const field = findFieldInConfig(config, name);
    if (!field || !(field.validation && field.validation.dnscheck && field.validation.dnscheck.value)) return;
    const val = controller.getValue(name);
    if (!val || String(val).indexOf('@') <= 0) { controller.clearGlueError(name); return; }
    const domain = String(val).split('@')[1];
    if (!domain) { controller.clearGlueError(name); return; }
    const msg = (field.validation.dnscheck && field.validation.dnscheck.message) || 'Домен не приймає пошту або не існує';
    const opts = { headers: { Accept: 'application/dns-json' } };
    const base = 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=';
    Promise.all([
      ctx.fetchImpl(base + 'MX', opts),
      ctx.fetchImpl(base + 'A', opts),
      ctx.fetchImpl(base + 'AAAA', opts),
    ]).then((responses) => Promise.all(responses.map((r) => r.json())))
      .then((results) => {
        if (String(controller.getValue(name)) !== String(val)) return;
        const has = (r) => Boolean(r && r.Answer && r.Answer.length > 0);
        if (!has(results[0]) && !has(results[1]) && !has(results[2])) controller.setGlueError(name, msg);
        else controller.clearGlueError(name);
      })
      .catch(() => {});
  };

  const scheduleEmailDns = (name) => {
    if (dnsTimers[name]) clearTimeout(dnsTimers[name]);
    dnsTimers[name] = later(() => { delete dnsTimers[name]; checkEmailDomain(name); }, 500);
  };

  const syncCounters = () => {
    for (const counter of queryAll(form, '[data-countdown]')) {
      const fieldName = counter.getAttribute('data-countdown');
      const control = form.querySelector(`[data-field="${escapeSelector(fieldName)}"]`);
      if (!control) continue;
      const left = counterRemaining(control, control.value);
      if (left !== null) counter.textContent = String(left);
    }
    for (const counter of queryAll(form, '[data-char-counter]')) {
      const fieldName = counter.getAttribute('data-char-counter');
      const control = form.querySelector(`[data-field="${escapeSelector(fieldName)}"]`);
      if (!control) continue;
      const span = counter.querySelector('span');
      const max = parseInt(counter.getAttribute('data-maxlength') || control.getAttribute('maxlength') || '0', 10) || 0;
      const known = findFieldInConfig(config, fieldName) ? controller.getValue(fieldName) : control.value;
      const len = (known === null || known === undefined) ? 0 : String(known).length;
      if (span) span.textContent = String(Math.max(0, max - len));
    }
  };

  for (const counter of queryAll(form, '[data-countdown], [data-char-counter]')) {
    const fieldName = counter.getAttribute('data-countdown') || counter.getAttribute('data-char-counter');
    const control = form.querySelector(`[data-field="${escapeSelector(fieldName)}"]`);
    if (control) control.addEventListener('input', syncCounters);
  }

  const lastEmailValue = {};
  controller.subscribe((event, names) => {
    if (Array.isArray(names)) {
      for (const n of names) {
        if (emailNames.indexOf(n) === -1) continue;
        const v = String(controller.getValue(n) || '');
        if (lastEmailValue[n] === v) continue;
        lastEmailValue[n] = v;
        scheduleEmailDns(n);
      }
    }
    syncCounters();
  });
  syncCounters();

  return { syncCounters, checkEmailDomain };
}

/** One submit pipeline; profiles only describe their guards and presentation. */
export function runSubmit(ctx, hooks = {}) {
  const { controller, state, fetchImpl } = ctx;
  const submit = () => {
    if (state.submitting) return;
    if (hooks.before && hooks.before(ctx) === false) return;
    if (!controller.validateAll()) {
      if (hooks.invalid) hooks.invalid(ctx);
      return;
    }
    if (hooks.guards && hooks.guards(ctx) === false) return;

    state.submitting = true;
    if (hooks.busy) hooks.busy(ctx);
    const tokens = hooks.tokens ? (hooks.tokens(ctx) || {}) : {};
    const request = hooks.request ? hooks.request(ctx, tokens) : null;
    if (!request || !request.url) {
      state.submitting = false;
      if (hooks.finish) hooks.finish(ctx);
      return;
    }
    fetchImpl(request.url, request.init || {})
      .then((r) => r.json().catch(() => ({})).then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => { if (hooks.response) hooks.response(ctx, ok, body); })
      .catch(() => { if (hooks.error) hooks.error(ctx); })
      .finally(() => {
        state.submitting = false;
        if (hooks.finish) hooks.finish(ctx);
      });
  };
  return submit;
}

export function wireSubmit(ctx, hooks = {}) {
  const submit = runSubmit(ctx, hooks);
  ctx.form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    submit();
  });
  for (const node of (hooks.triggers ? hooks.triggers(ctx) : []) || []) {
    if (node && node.addEventListener) node.addEventListener('click', submit);
  }
  return submit;
}

/** Boot one form from its island. The profile comes from the caller, never from a form name. */
export function bootForm(root, opts = {}) {
  const ctx = createContext(root, opts);
  if (!ctx) return null;
  ctx.shared = wireAsync(ctx);
  const profileResult = ctx.profile.setup ? (ctx.profile.setup(ctx) || {}) : {};
  if (profileResult.subscribe) ctx.controller.subscribe((event, names) => profileResult.subscribe(ctx, event, names));
  return {
    controller: ctx.controller,
    form: ctx.form,
    data: ctx.data,
    state: ctx.state,
    binder: ctx.binder,
    config: ctx.config,
    name: ctx.name,
    mode: ctx.mode,
    ...(profileResult.extras || {}),
  };
}

/** Discover every island on the page and dispatch it by behavior.mode. */
export function bootForms(root, opts = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const profiles = opts.profiles || {};
  const islands = root.querySelectorAll(`script[type="application/json"][id$="${CONFIG_SUFFIX}"]`);
  const handles = [];
  const seen = new Set();
  for (const node of islands) {
    const name = node.id.slice(0, -CONFIG_SUFFIX.length);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    let config;
    try { config = JSON.parse(node.textContent); } catch { continue; }
    const mode = (config.behavior && config.behavior.mode) || 'page';
    const profile = profiles[mode] || profiles.page;
    if (!profile) continue;
    const handle = bootForm(root, { ...opts, name, mode, profile });
    if (handle) handles.push(handle);
  }
  return handles;
}
