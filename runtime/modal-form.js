/**
 * Browser boot for modal forms (behavior.mode: modal).
 *
 * Generic modal runtime: discovers the form island, mounts the rendered form,
 * wires controller/binder and submit lifecycle. Supports config-driven captcha
 * widgets and page-context prefilling. Keeps compatibility with legacy notify
 * selectors/IDs where present.
 */

import { FormRender } from './render.js';
import { makeController } from './controller.js';
import { bindForm } from './binder.js';
import { CAPTCHA_REQUIRED_TEXT, counterRemaining, findFieldInConfig, stepFieldNames } from './data.js';
import { buildJsonPayload } from './submit.js';

function qsa(root, sel) {
  return root && root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll(sel)) : [];
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

function captchaTokenKey(field) {
  return (field && field.token) || 'cf-turnstile-response';
}

function ensureStatusEl(form, kind, legacyId) {
  let el = form.querySelector(`[data-form-${kind}]`);
  if (!el && legacyId) el = form.querySelector(`#${legacyId}`) || (form.ownerDocument && form.ownerDocument.getElementById(legacyId));
  if (el) return el;
  const div = (form.ownerDocument || document).createElement('div');
  if (kind === 'error') {
    div.className = 'alert alert-danger d-none';
    div.setAttribute('role', 'alert');
    div.setAttribute('data-form-error', '');
  } else if (kind === 'success') {
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
  const doc = form.ownerDocument || document;
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
 * Boots the modal form.
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
  if (!app || !configNode) {
    app = root.getElementById('notify-app');
    configNode = root.getElementById('notify-config');
  }
  if (!app || !configNode) return null;

  let config;
  try {
    config = JSON.parse(configNode.textContent);
  } catch {
    return null;
  }
  const formName = name || config.id || (configNode.id || '').replace(/-config$/, '') || 'notify';

  const pageNode = root.getElementById(`${formName}-page`) || root.getElementById('notify-page');
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

  const findById = (id) => (id ? (form.querySelector(`#${id}`) || root.getElementById(id)) : null);
  const errorEl = () => form.querySelector('[data-form-error]') || findById('notify-error') || ensureStatusEl(form, 'error', 'notify-error');
  const successEl = () => form.querySelector('[data-form-success]') || findById('notify-success');

  const showError = (message) => {
    const err = errorEl();
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
    const err = form.querySelector('[data-form-error]') || findById('notify-error');
    if (err) err.classList.add('d-none');
  };
  const hideSuccess = () => {
    const ok = form.querySelector('[data-form-success]') || findById('notify-success');
    if (ok) ok.classList.add('d-none');
  };

  // Prefill page context (generic) and keep hidden fields in sync.
  for (const [key, value] of Object.entries(page || {})) {
    if (value === undefined || value === null) continue;
    for (const input of qsa(form, `[name="${CSS && CSS.escape ? CSS.escape(key) : key}"]`)) {
      if (input && (input.value === '' || input.value === undefined || input.value === null)) input.value = String(value);
    }
  }

  const timestampInput = form.querySelector('[name="timestamp"]');
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
  const isCaptchaBlocked = () => {
    if (!Captcha || !Captcha.enabled || !Captcha.enabled()) return false;
    for (const field of captchaFields) {
      const sel = captchaSelector(field);
      if (Captcha.solved && !Captcha.solved(sel)) return true;
    }
    return false;
  };

  const ensureSuccessEl = () => form.querySelector('[data-form-success]') || findById('notify-success') || ensureStatusEl(form, 'success', 'notify-success');
  const submitBtn = ensureSubmitButton(form, config);
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
    const localNotice = findById('notify-local-notice');
    if (localNotice) localNotice.classList.add('d-none');
    const retryNotice = findById('notify-captcha-retry');
    if (retryNotice) retryNotice.classList.add('d-none');
    for (const [key, value] of Object.entries(page || {})) {
      if (value === undefined || value === null) continue;
      for (const input of qsa(form, `[name="${CSS && CSS.escape ? CSS.escape(key) : key}"]`)) {
        if (input) input.value = String(value);
      }
    }
    restoreSubmit();
    syncCounters();
  };

  const mountCaptcha = () => {
    if (!Captcha || !captchaFields.length) return;
    for (const field of captchaFields) {
      const sel = captchaSelector(field);
      const action = field.action || field.captchaAction || formName;
      const retryNotice = findById('notify-captcha-retry');
      if (Captcha.isLocal && Captcha.isLocal()) {
        const notice = findById('notify-local-notice');
        if (notice) notice.classList.remove('d-none');
        continue;
      }
      const notice = findById('notify-local-notice');
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
      } catch {
        later(mountCaptcha, 700);
      }
    }
  };

  const unmountCaptcha = () => {
    if (!Captcha) return;
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
    dnsTimers[name] = setTimeout(() => { delete dnsTimers[name]; checkEmailDomain(name); }, 500);
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

  const modalSelector = (config.behavior && config.behavior.modal) || '#notifyModal';
  let modalEl = null;
  try { modalEl = root.querySelector(modalSelector) || (modalSelector.startsWith('#') ? root.getElementById(modalSelector.slice(1)) : null) || (form.closest ? form.closest('.modal') : null); } catch { modalEl = root.getElementById('notifyModal'); }
  if (modalEl) {
    onModalEvent(modalEl, 'show.bs.modal', resetForm);
    onModalEvent(modalEl, 'shown.bs.modal', mountCaptcha);
    onModalEvent(modalEl, 'hidden.bs.modal', unmountCaptcha);
  }

  const retryBtn = findById('notify-captcha-retry-btn') || form.querySelector('[data-captcha-retry]');
  if (retryBtn) retryBtn.addEventListener('click', mountCaptcha);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const valid = controller.validateAll();
    if (isCaptchaBlocked()) {
      showError(CAPTCHA_REQUIRED_TEXT);
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
      const key = captchaTokenKey(field);
      tokens[key] = Captcha && Captcha.token ? (Captcha.token(sel) || '') : '';
    }
    const primaryToken = captchaFields.length ? (tokens[captchaTokenKey(captchaFields[0])] || '') : '';
    const payload = buildJsonPayload(form, controller, primaryToken);
    for (const [k, v] of Object.entries(tokens)) payload[k] = v;

    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitBtn.tagName !== 'INPUT') submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>Надсилання...';
    }

    fetchImpl(form.getAttribute('action') || endpoint, {
      method: (config.submit && config.submit.method) || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json().catch(() => ({})).then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || !body || !body.success) {
          const code = body && body.code;
          if (controller.setServerErrors && body && body.errors) controller.setServerErrors(body.errors);
          showError((body && (body.message || body.error)) || (code ? String(code) : 'На жаль, сталася помилка. Спробуйте ще раз пізніше.'));
          if (Captcha && code && String(code).indexOf('E_CAPTCHA') === 0) {
            const rn = findById('notify-captcha-retry');
            if (rn) rn.classList.remove('d-none');
          }
          throw new Error('Send failed');
        }
        setGroupsVisible(false);
        const ln = findById('notify-local-notice');
        if (ln) ln.classList.add('d-none');
        const okEl = ensureSuccessEl();
        if (okEl) okEl.classList.remove('d-none');
        if (submitBtn) submitBtn.classList.add('d-none');
      })
      .catch(() => {
        restoreSubmit();
      });
  });

  return { form, controller, binder, reset: resetForm, mountCaptcha, unmountCaptcha, config, name: formName };
}
