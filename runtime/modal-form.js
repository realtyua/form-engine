/**
 * Browser boot for modal forms (behavior.mode: modal).
 *
 * Generic modal runtime: discovers the form island, mounts the rendered form,
 * wires controller/binder and drives a config-driven life-cycle. Nodes, events,
 * submit/status/retry/notice hooks and captcha settings come from `behavior`
 * (with DOM data-* hooks as the default contract). The notify IDs are kept only
 * as a compatibility fallback for the legacy form; a new config never needs
 * them.
 */

import { FormRender } from './render.js';
import { makeController } from './controller.js';
import { bindForm } from './binder.js';
import { CAPTCHA_REQUIRED_TEXT, counterRemaining, findFieldInConfig, stepFieldNames } from './data.js';
import { buildJsonPayload } from './submit.js';

const LEGACY_NAME = 'notify';
const GENERIC_ERROR_TEXT = 'На жаль, сталася помилка. Спробуйте ще раз пізніше.';

function qsa(root, sel) {
  return root && root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll(sel)) : [];
}

function selectorList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function escapeSelector(value) {
  const raw = String(value);
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
}

/** First node matching a config selector, a DOM hook, or a legacy id. */
function findNode(form, root, selectors, legacyIds = []) {
  const list = selectorList(selectors).concat(legacyIds.map((id) => `#${id}`));
  for (const sel of list) {
    for (const scope of [form, root]) {
      if (!scope || !scope.querySelector) continue;
      let node;
      try { node = scope.querySelector(sel); } catch { continue; }
      if (node) return node;
    }
    if (sel.startsWith('#') && root && root.getElementById) {
      const node = root.getElementById(sel.slice(1));
      if (node) return node;
    }
  }
  return null;
}

function findNodes(root, selectors) {
  const out = [];
  for (const sel of selectorList(selectors)) {
    if (!root || !root.querySelectorAll) continue;
    let nodes;
    try { nodes = root.querySelectorAll(sel); } catch { continue; }
    for (const node of Array.prototype.slice.call(nodes)) {
      if (out.indexOf(node) === -1) out.push(node);
    }
  }
  return out;
}

function modalBehavior(config) {
  const behavior = (config && config.behavior) || {};
  return {
    modal: behavior.modal,
    seed: behavior.seed,
    success: behavior.success || {},
    reset: behavior.reset !== false,
    submit: behavior.submit,
    status: behavior.status || {},
    notice: behavior.notice,
    retry: behavior.retry,
    retryNotice: behavior.retryNotice,
    events: behavior.events || {},
    timestamp: behavior.timestamp || (config.settings && config.settings.timestampField) || 'timestamp',
  };
}

function findCaptchaFields(config) {
  const out = [];
  for (const step of config.steps || []) {
    for (const field of stepFieldNames(step)) {
      if (field && field.type === 'widgets' && field.widget === 'captcha') out.push(field);
    }
  }
  return out;
}

function captchaSelector(field) {
  const id = (field && (field.element_id || field.name)) || 'turnstile';
  return `#${id}-widget`;
}

function captchaTokenKey(field, config) {
  const configured = config.submit && config.submit.captcha && config.submit.captcha.token;
  return (field && field.token) || configured || 'cf-turnstile-response';
}

function captchaAction(field, config, formName) {
  const configured = config.submit && config.submit.captcha && config.submit.captcha.action;
  return (field && (field.action || field.captchaAction)) || configured || formName;
}

function ensureStatusEl(form, kind) {
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

function ensureSubmitButton(form, config) {
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

/**
 * Boots one modal form.
 * @param {Document} root
 * @param {object} [opts]
 *   {string}   [opts.name]
 *   {object}   [opts.Captcha]
 *   {object}   [opts.jQuery]
 *   {function} [opts.fetch]
 *   {function} [opts.now]
 *   {function} [opts.setTimeout]
 */
export function bootModal(root, opts = {}) {
  if (!root) return null;
  const name = opts.name || '';
  let app = name ? root.getElementById(`${name}-app`) : null;
  let configNode = name ? root.getElementById(`${name}-config`) : null;
  if ((!app || !configNode) && (!name || name === LEGACY_NAME)) {
    app = app || root.getElementById(`${LEGACY_NAME}-app`);
    configNode = configNode || root.getElementById(`${LEGACY_NAME}-config`);
  }
  if (!app || !configNode) return null;

  let config;
  try {
    config = JSON.parse(configNode.textContent);
  } catch {
    return null;
  }
  const legacy = !name || name === LEGACY_NAME || config.id === LEGACY_NAME;
  const formName = name || config.id || (configNode.id || '').replace(/-config$/, '') || (legacy ? LEGACY_NAME : null);
  if (!formName) return null;
  const behavior = modalBehavior(config);

  const seedId = behavior.seed || `${formName}-page`;
  let pageNode = root.getElementById(seedId);
  if (!pageNode && legacy) pageNode = root.getElementById(`${LEGACY_NAME}-page`);
  let page = {};
  if (pageNode) {
    try { page = JSON.parse(pageNode.textContent) || {}; } catch { page = {}; }
  }

  const endpoint = app.getAttribute('data-endpoint') || (config.submit && config.submit.action) || '';
  config.submit = { ...(config.submit || {}), method: (config.submit && config.submit.method) || 'POST' };
  if (endpoint) config.submit.action = endpoint;

  const form = FormRender.mount(app, config);
  if (!form) return null;
  const controller = makeController(config);
  const theme = FormRender.theme(config.theme || 'bootstrap4');
  const binder = bindForm(form, controller, { classes: theme.validationClasses, colClass: theme.colClass });

  const Captcha = opts.Captcha !== undefined
    ? opts.Captcha
    : (typeof window !== 'undefined' ? window.CaptchaSite || null : null);
  const jq = opts.jQuery !== undefined
    ? opts.jQuery
    : (typeof window !== 'undefined' ? window.jQuery || null : null);
  const fetchImpl = opts.fetch || ((...args) => globalThis.fetch(...args));
  const now = opts.now || (() => Date.now());
  const later = opts.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const legacyIds = (id) => (legacy ? [id] : []);

  const errorSelectors = [behavior.status.error, '[data-form-error]'].filter(Boolean);
  const successSelectors = [behavior.status.success, '[data-form-success]'].filter(Boolean);
  const noticeSelectors = [behavior.notice, '[data-form-notice]'].filter(Boolean);
  const retryNoticeSelectors = [behavior.retryNotice, '[data-form-captcha-retry]'].filter(Boolean);
  const retrySelectors = [behavior.retry, '[data-captcha-retry]'].filter(Boolean);
  const submitSelectors = [behavior.submit, '[data-form-submit]'].filter(Boolean);

  const errorEl = () => findNode(form, root, errorSelectors, legacyIds('notify-error'));
  const ensureErrorEl = () => errorEl() || ensureStatusEl(form, 'error');
  const successEl = () => findNode(form, root, successSelectors, legacyIds('notify-success'));
  const noticeEl = () => findNode(form, root, noticeSelectors, legacyIds('notify-local-notice'));
  const retryNoticeEl = () => findNode(form, root, retryNoticeSelectors, legacyIds('notify-captcha-retry'));
  const retryBtnEl = () => findNode(form, root, retrySelectors, legacyIds('notify-captcha-retry-btn'));

  const errors = (config.submit && config.submit.errors) || {};
  const errorCopy = (code, fallback) => (code && errors[code]) || fallback;
  const responseError = (body) => {
    if (!body) return GENERIC_ERROR_TEXT;
    if (body.message || body.error) return String(body.message || body.error);
    if (body.code) return errorCopy(body.code, String(body.code));
    return GENERIC_ERROR_TEXT;
  };

  const showError = (message) => {
    const err = ensureErrorEl();
    if (!err) return;
    if (message !== undefined && message !== null && message !== '') err.textContent = String(message);
    else if (message === '') {
      if (!err.getAttribute('data-default-text')) err.setAttribute('data-default-text', err.textContent || '');
      const def = err.getAttribute('data-default-text');
      if (def) err.textContent = def;
    }
    err.classList.remove('d-none');
  };
  const hideError = () => {
    const err = errorEl();
    if (err) err.classList.add('d-none');
  };
  const hideSuccess = () => {
    const ok = successEl();
    if (ok) ok.classList.add('d-none');
  };
  const showSuccess = () => {
    const ok = successEl() || ensureStatusEl(form, 'success');
    if (ok) ok.classList.remove('d-none');
  };

  // Prefill page context (generic) and keep hidden fields in sync.
  const seedInputs = (overwrite) => {
    for (const [key, value] of Object.entries(page || {})) {
      if (value === undefined || value === null) continue;
      for (const input of qsa(form, `[name="${escapeSelector(key)}"]`)) {
        if (!input) continue;
        if (!overwrite && input.value !== '' && input.value !== undefined && input.value !== null) continue;
        input.value = String(value);
      }
    }
  };
  seedInputs(false);

  const timestampInput = form.querySelector(`[name="${escapeSelector(behavior.timestamp)}"]`);
  const stamp = () => { if (timestampInput) timestampInput.value = String(now()); };
  stamp();

  // Character counters: support legacy data-countdown and theme data-char-counter.
  const syncCounters = () => {
    for (const counter of qsa(form, '[data-countdown]')) {
      const fieldName = counter.getAttribute('data-countdown');
      const control = form.querySelector(`[data-field="${fieldName}"]`);
      if (!control) continue;
      const left = counterRemaining(control, control.value);
      if (left !== null) counter.textContent = String(left);
    }
    for (const counter of qsa(form, '[data-char-counter]')) {
      const fieldName = counter.getAttribute('data-char-counter');
      const control = form.querySelector(`[data-field="${fieldName}"]`);
      if (!control) continue;
      const span = counter.querySelector('span');
      const max = parseInt(counter.getAttribute('data-maxlength') || control.getAttribute('maxlength') || '0', 10) || 0;
      const len = String(control.value || '').length;
      if (span) span.textContent = String(Math.max(0, max - len));
    }
  };
  for (const counter of qsa(form, '[data-countdown]')) {
    const fieldName = counter.getAttribute('data-countdown');
    const control = form.querySelector(`[data-field="${fieldName}"]`);
    if (control) control.addEventListener('input', syncCounters);
  }
  for (const counter of qsa(form, '[data-char-counter]')) {
    const fieldName = counter.getAttribute('data-char-counter');
    const control = form.querySelector(`[data-field="${fieldName}"]`);
    if (control) control.addEventListener('input', syncCounters);
  }
  syncCounters();

  const captchaFields = findCaptchaFields(config);
  const captchaWatchTimers = {};

  const controllerSolved = (field) => {
    const sel = captchaSelector(field);
    if (!form.querySelector(sel)) return true;
    return Boolean(Captcha && Captcha.solved && Captcha.solved(sel));
  };

  const syncCaptchaState = (field) => {
    if (!Captcha || (Captcha.isLocal && Captcha.isLocal()) || !(Captcha.enabled && Captcha.enabled())) {
      controller.setCaptchaSolved(field.name, true);
      return;
    }
    const sel = captchaSelector(field);
    if (controllerSolved(field)) {
      controller.setCaptchaSolved(field.name, true);
      controller.setCaptchaToken(field.name, Captcha && Captcha.token ? (Captcha.token(sel) || '') : '');
    } else {
      controller.setCaptchaSolved(field.name, false);
      controller.setCaptchaToken(field.name, '');
    }
  };

  const watchCaptchaToken = (field) => {
    const key = field.name;
    if (captchaWatchTimers[key]) return;
    let ticks = 0;
    const poll = () => {
      captchaWatchTimers[key] = null;
      ticks += 1;
      if (controllerSolved(field)) {
        syncCaptchaState(field);
        return;
      }
      if (ticks < 100) captchaWatchTimers[key] = later(poll, 250);
    };
    captchaWatchTimers[key] = later(poll, 250);
  };

  const stopCaptchaWatch = () => {
    for (const key of Object.keys(captchaWatchTimers)) {
      if (captchaWatchTimers[key]) clearTimeout(captchaWatchTimers[key]);
      delete captchaWatchTimers[key];
    }
  };

  for (const field of captchaFields) syncCaptchaState(field);

  const isCaptchaBlocked = () => {
    if (!Captcha || !Captcha.enabled || !Captcha.enabled()) return false;
    for (const field of captchaFields) {
      if (!controllerSolved(field)) return true;
    }
    return false;
  };

  const submitBtn = findNode(form, root, submitSelectors, legacyIds('notify-submit')) || ensureSubmitButton(form, config);
  const defaultSubmitHtml = submitBtn ? submitBtn.innerHTML : '';
  const defaultSubmitText = submitBtn ? submitBtn.textContent : 'Надіслати';

  const restoreSubmit = () => {
    if (!submitBtn) return;
    submitBtn.disabled = false;
    if (submitBtn.tagName === 'INPUT') submitBtn.value = defaultSubmitText;
    else submitBtn.innerHTML = defaultSubmitHtml || defaultSubmitText;
    submitBtn.classList.remove('d-none');
  };

  const setGroupsVisible = (visible) => {
    for (const group of qsa(form, '[data-field-group]')) {
      if (visible) group.classList.remove('d-none');
      else group.classList.add('d-none');
    }
  };

  const resetForm = () => {
    stamp();
    hideError();
    hideSuccess();
    form.classList.remove('was-validated');
    setGroupsVisible(true);
    const notice = noticeEl();
    if (notice) notice.classList.add('d-none');
    const retryNotice = retryNoticeEl();
    if (retryNotice) retryNotice.classList.add('d-none');
    seedInputs(true);
    for (const field of captchaFields) syncCaptchaState(field);
    restoreSubmit();
    syncCounters();
  };

  const mountCaptcha = () => {
    if (!Captcha || !captchaFields.length) return;
    for (const field of captchaFields) {
      const sel = captchaSelector(field);
      const action = captchaAction(field, config, formName);
      const retryNotice = retryNoticeEl();
      if (Captcha.isLocal && Captcha.isLocal()) {
        controller.setCaptchaSolved(field.name, true);
        const notice = noticeEl();
        if (notice) notice.classList.remove('d-none');
        continue;
      }
      controller.setCaptchaSolved(field.name, false);
      controller.setCaptchaToken(field.name, '');
      const notice = noticeEl();
      if (notice) notice.classList.add('d-none');
      if (retryNotice) retryNotice.classList.add('d-none');
      if (typeof window === 'undefined' || typeof window.turnstile === 'undefined') {
        later(mountCaptcha, 250);
        return;
      }
      let mounted = false;
      try {
        Captcha.mount(sel, action, () => {
          if (!mounted) {
            mounted = true;
            later(mountCaptcha, 700);
            return;
          }
          if (retryNotice) retryNotice.classList.remove('d-none');
          showError('Не вдалося завантажити перевірку.');
        });
        mounted = true;
        watchCaptchaToken(field);
      } catch {
        later(mountCaptcha, 700);
      }
    }
  };

  const unmountCaptcha = () => {
    if (!Captcha) return;
    stopCaptchaWatch();
    for (const field of captchaFields) {
      try { Captcha.unmount && Captcha.unmount(captchaSelector(field)); } catch {}
    }
  };

  // dnscheck for email fields (parity with page-form for configured fields)
  const dnsTimers = {};
  const emailFieldNames = (() => {
    const out = [];
    for (const step of config.steps || []) {
      for (const field of stepFieldNames(step)) {
        if (field && field.type === 'email') out.push(field.name);
      }
    }
    return out;
  })();
  const checkEmailDomain = (name) => {
    const field = findFieldInConfig(config, name);
    if (!field || !(field.validation && field.validation.dnscheck && field.validation.dnscheck.value)) return;
    const val = controller.getValue(name);
    if (!val || String(val).indexOf('@') <= 0) { controller.clearGlueError(name); return; }
    const domain = String(val).split('@')[1];
    if (!domain) { controller.clearGlueError(name); return; }
    const msg = (field.validation && field.validation.dnscheck && field.validation.dnscheck.message) || 'Домен не приймає пошту або не існує';
    const headers = { Accept: 'application/dns-json' };
    const base = 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=';
    Promise.all([
      fetchImpl(base + 'MX', { headers }).then((r) => r.json()).catch(() => ({})),
      fetchImpl(base + 'A', { headers }).then((r) => r.json()).catch(() => ({})),
      fetchImpl(base + 'AAAA', { headers }).then((r) => r.json()).catch(() => ({})),
    ]).then((results) => {
      if (String(controller.getValue(name) || '') !== String(val)) return;
      const has = (r) => Boolean(r && r.Answer && r.Answer.length > 0);
      if (!has(results[0]) && !has(results[1]) && !has(results[2])) controller.setGlueError(name, msg);
      else controller.clearGlueError(name);
    }).catch(() => {});
  };
  const scheduleEmailDns = (name) => {
    if (dnsTimers[name]) clearTimeout(dnsTimers[name]);
    dnsTimers[name] = later(() => { delete dnsTimers[name]; checkEmailDomain(name); }, 500);
  };
  const lastEmailValue = {};
  controller.subscribe((event, names) => {
    if (Array.isArray(names)) {
      for (const n of names) {
        if (emailFieldNames.indexOf(n) === -1) continue;
        const v = String(controller.getValue(n) || '');
        if (lastEmailValue[n] === v) continue;
        lastEmailValue[n] = v;
        scheduleEmailDns(n);
      }
    }
    syncCounters();
  });

  const onModalEvent = (modalEl, eventName, handler) => {
    if (!modalEl) return;
    if (jq && jq(modalEl) && jq(modalEl).on) { jq(modalEl).on(eventName, handler); return; }
    modalEl.addEventListener(eventName, handler);
  };

  let modalEl = behavior.modal ? findNode(form, root, [behavior.modal], legacyIds(LEGACY_NAME + 'Modal')) : null;
  if (!modalEl && form.closest) modalEl = form.closest('.modal');
  const events = {
    show: behavior.events.show || 'show.bs.modal',
    shown: behavior.events.shown || 'shown.bs.modal',
    hidden: behavior.events.hidden || 'hidden.bs.modal',
  };
  if (modalEl) {
    onModalEvent(modalEl, events.show, () => { if (behavior.reset) resetForm(); });
    onModalEvent(modalEl, events.shown, mountCaptcha);
    onModalEvent(modalEl, events.hidden, unmountCaptcha);
  }

  const retryBtn = retryBtnEl();
  if (retryBtn) retryBtn.addEventListener('click', mountCaptcha);

  const showBusy = () => {
    if (!submitBtn) return;
    submitBtn.disabled = true;
    if (submitBtn.tagName !== 'INPUT') {
      const sending = (config.chrome && config.chrome.sending) || 'Надсилання...';
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>' + sending;
    }
  };

  const applySuccessHooks = () => {
    for (const node of findNodes(root, behavior.success.hide)) node.classList.add('d-none');
    for (const node of findNodes(root, behavior.success.show)) node.classList.remove('d-none');
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();

    // sync captcha state/tokens to controller before validation
    for (const field of captchaFields) syncCaptchaState(field);

    const valid = controller.validateAll();
    if (isCaptchaBlocked()) {
      showError(errorCopy('E_CAPTCHA_REQUIRED', CAPTCHA_REQUIRED_TEXT));
      form.classList.add('was-validated');
      return;
    }
    if (!valid) {
      form.classList.add('was-validated');
      return;
    }
    form.classList.remove('was-validated');

    // collect captcha tokens (first/primary token also passed to buildJsonPayload)
    const tokens = {};
    for (const field of captchaFields) {
      const sel = captchaSelector(field);
      const key = captchaTokenKey(field, config);
      const tok = Captcha && Captcha.token ? (Captcha.token(sel) || '') : '';
      tokens[key] = tok;
      if (tok) controller.setCaptchaToken(field.name, tok);
    }
    const primaryToken = captchaFields.length ? (tokens[captchaTokenKey(captchaFields[0], config)] || '') : '';
    const payload = buildJsonPayload(form, controller, primaryToken);
    for (const [k, v] of Object.entries(tokens)) payload[k] = v;

    showBusy();

    fetchImpl(form.getAttribute('action') || endpoint, {
      method: (config.submit && config.submit.method) || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json().catch(() => ({})).then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || !body || !body.success) {
          if (controller.setServerErrors && body && body.errors) controller.setServerErrors(body.errors);
          showError(responseError(body));
          if (Captcha && body && String(body.code || '').indexOf('E_CAPTCHA') === 0) {
            const retryNotice = retryNoticeEl();
            if (retryNotice) retryNotice.classList.remove('d-none');
          }
          throw new Error('Send failed');
        }
        setGroupsVisible(false);
        const notice = noticeEl();
        if (notice) notice.classList.add('d-none');
        showSuccess();
        if (submitBtn) submitBtn.classList.add('d-none');
        applySuccessHooks();
      })
      .catch(() => {
        restoreSubmit();
      });
  });

  return { form, controller, binder, reset: resetForm, mountCaptcha, unmountCaptcha, config, name: formName };
}
