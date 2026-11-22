/**
 * Modal profile of the shared form boot: lifecycle, status and notice hooks.
 * Discovery, mount, controller/binder, async checks and the submit pipeline are
 * owned by form-runtime.js; ids and selectors come from behavior or neutral
 * data-* hooks, with derived ids as the only compatibility fallback.
 */

import { CAPTCHA_REQUIRED_TEXT } from './data.js';
import { buildJsonPayload } from './submit.js';
import {
  bootForm, captchaAction, captchaEnabled, captchaSelector, captchaSolved, captchaTokenKey,
  ensureStatusEl, ensureSubmitButton, escapeSelector, findAction, findNode,
  findNodes, findWidgets, queryAll, resetFormState, setActionState, wireActions,
  wireSubmit,
} from './form-runtime.js';

const GENERIC_ERROR_TEXT = 'На жаль, сталася помилка. Спробуйте ще раз пізніше.';

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

export const modalProfile = {
  mode: 'modal',
  submitMethod: (config) => (config.submit && config.submit.method) || 'POST',
  controllerOpts: () => ({}),
  setup: (ctx) => setupModal(ctx),
};

/** Thin compatibility wrapper: the shared engine does all the discovery. */
export function bootModal(root, opts = {}) {
  return bootForm(root, { ...opts, mode: 'modal', profile: modalProfile });
}

function setupModal(ctx) {
  const {
    root, name, config, form, controller, data, state, endpoint,
    Captcha, fetchImpl, later, now, opts,
  } = ctx;

  const jq = opts.jQuery !== undefined
    ? opts.jQuery
    : (typeof window !== 'undefined' ? window.jQuery || null : null);
  const behavior = modalBehavior(config);
  const qsa = (selector, scope = form) => queryAll(scope, selector);

  // Derived ids are the only fallback; no production form name is baked in.
  const fallback = (suffix) => [`${name}-${suffix}`];
  const findIn = (scope, selectors, ids) => findNode(scope, selectors, ids);
  const findModalNode = (selectors, ids) =>
    findIn(form, selectors, ids) || findIn(root, selectors, ids);

  const errorSelectors = [behavior.status.error, '[data-form-error]'].filter(Boolean);
  const successSelectors = [behavior.status.success, '[data-form-success]'].filter(Boolean);
  const noticeSelectors = [behavior.notice, '[data-form-notice]'].filter(Boolean);
  const retryNoticeSelectors = [behavior.retryNotice, '[data-form-captcha-retry]'].filter(Boolean);
  const retrySelectors = [behavior.retry, '[data-captcha-retry]'].filter(Boolean);
  const submitSelectors = [behavior.submit, '[data-form-submit]'].filter(Boolean);

  const errorEl = () => findModalNode(errorSelectors, fallback('error'));
  const ensureErrorEl = () => errorEl() || ensureStatusEl(form, 'error');
  const successEl = () => findModalNode(successSelectors, fallback('success'));
  const noticeEl = () => findModalNode(noticeSelectors, fallback('local-notice'));
  const retryNoticeEl = () => findModalNode(retryNoticeSelectors, fallback('captcha-retry'));
  const retryBtnEl = () => findModalNode(retrySelectors, fallback('captcha-retry-btn'));

  const errors = (config.submit && config.submit.errors) || {};
  const errorCopy = (code, fallbackText) => (code && errors[code]) || fallbackText;
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

  // Prefill generic page context (behavior.seed) and keep hidden fields in sync.
  const pageNode = root.getElementById
    ? root.getElementById(behavior.seed || `${name}-page`)
    : findIn(root, [`#${escapeSelector(behavior.seed || `${name}-page`)}`]);
  let page = {};
  if (pageNode) {
    try { page = JSON.parse(pageNode.textContent) || {}; } catch { page = {}; }
  }

  const seedInputs = (overwrite) => {
    for (const [key, value] of Object.entries(page)) {
      if (value === undefined || value === null) continue;
      for (const input of qsa(`[name="${escapeSelector(key)}"]`)) {
        if (!input) continue;
        if (!overwrite && input.value !== '' && input.value !== undefined && input.value !== null) continue;
        input.value = String(value);
      }
    }
  };
  seedInputs(false);

  const timestampInput = behavior.timestamp
    ? form.querySelector(`[name="${escapeSelector(behavior.timestamp)}"]`)
    : null;
  const stamp = () => { if (timestampInput) timestampInput.value = String(now()); };
  stamp();

  // ------------------------------------------------------------- captcha -----

  const captchaFields = findWidgets(config, 'captcha');
  const captchaWatchTimers = {};

  const enabled = () => captchaEnabled(Captcha);
  const captchaLocal = () => Boolean(Captcha && (
    typeof Captcha.isLocal === 'function' ? Captcha.isLocal() : Captcha.isLocal
  ));

  const controllerSolved = (field) => captchaSolved(form, Captcha, field);

  const syncCaptchaState = (field) => {
    if (!Captcha || captchaLocal() || !enabled()) {
      controller.setCaptchaSolved(field.name, true);
      return;
    }
    const selector = captchaSelector(field);
    if (controllerSolved(field)) {
      controller.setCaptchaSolved(field.name, true);
      controller.setCaptchaToken(field.name, Captcha.token ? (Captcha.token(selector) || '') : '');
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
    if (!enabled()) return false;
    return captchaFields.some((field) => !controllerSolved(field));
  };

  const mountCaptcha = () => {
    if (!Captcha || !captchaFields.length) return;
    for (const field of captchaFields) {
      const selector = captchaSelector(field);
      const action = captchaAction(field, config, name);
      const retryNotice = retryNoticeEl();
      if (captchaLocal()) {
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
        Captcha.mount(selector, action, () => {
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
      try { if (Captcha.unmount) Captcha.unmount(captchaSelector(field)); } catch { /* noop */ }
    }
  };

  // ------------------------------------------------------- modal lifecycle ----

  // The neutral hook wins, then the config's legacy selector, then a generated
  // button. A valid modal config can therefore submit without any baked id.
  const submitBtn = findAction(root, config, 'submit') ||
    findModalNode(submitSelectors, fallback('submit')) ||
    ensureSubmitButton(form, config, config.theme);

  const restoreSubmit = () => {
    if (!submitBtn) return;
    setActionState(submitBtn, 'idle', config);
    submitBtn.classList.remove('d-none');
  };

  const setGroupsVisible = (visible) => {
    for (const group of qsa('[data-field-group]')) {
      if (visible) group.classList.remove('d-none');
      else group.classList.add('d-none');
    }
  };

  const resetForm = () => {
    resetFormState(ctx);
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
    if (ctx.shared) ctx.shared.syncCounters();
  };

  const onModalEvent = (modalEl, eventName, handler) => {
    if (!modalEl) return;
    if (jq && typeof jq === 'function') {
      const wrapped = jq(modalEl);
      if (wrapped && wrapped.on) { wrapped.on(eventName, handler); return; }
    }
    modalEl.addEventListener(eventName, handler);
  };

  let modalEl = behavior.modal
    ? findModalNode([behavior.modal], [`${name}Modal`])
    : null;
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

  // Reset/cancel are opt-in actions: they exist when the config declares a
  // selector or the markup carries the neutral hook. The submit action is
  // always present (generated when necessary) and is wired by wireSubmit.
  wireActions(ctx, {
    reset: () => { if (behavior.reset) resetForm(); },
    cancel: () => {
      if (!modalEl) return;
      const hideEvent = behavior.events.hide || 'hide.bs.modal';
      if (jq && typeof jq === 'function') {
        const wrapped = jq(modalEl);
        if (wrapped && typeof wrapped.modal === 'function') {
          wrapped.modal('hide');
          return;
        }
      }
      modalEl.dispatchEvent(new Event(hideEvent, { bubbles: true }));
    },
  }, modalEl || root);

  const applySuccessHooks = () => {
    for (const node of findNodes(root, behavior.success.hide)) node.classList.add('d-none');
    for (const node of findNodes(root, behavior.success.show)) node.classList.remove('d-none');
  };

  // --------------------------------------------------------------- submit -----

  let failed = false;

  wireSubmit(ctx, {
    triggers: () => [submitBtn].filter(Boolean),
    actions: () => [submitBtn].filter(Boolean),
    before: () => {
      failed = false;
      for (const field of captchaFields) syncCaptchaState(field);
      if (isCaptchaBlocked()) {
        showError(errorCopy('E_CAPTCHA_REQUIRED', CAPTCHA_REQUIRED_TEXT));
        form.classList.add('was-validated');
        return false;
      }
      form.classList.remove('was-validated');
      return true;
    },
    invalid: () => { form.classList.add('was-validated'); },
    tokens: (c) => {
      const tokens = {};
      for (const field of captchaFields) {
        const key = captchaTokenKey(field, config);
        const token = Captcha && Captcha.token ? (Captcha.token(captchaSelector(field)) || '') : '';
        tokens[key] = token;
        if (token) controller.setCaptchaToken(field.name, token);
      }
      return tokens;
    },
    request: (c, tokens) => {
      const primary = captchaFields[0];
      const primaryToken = primary ? (tokens[captchaTokenKey(primary, config)] || '') : '';
      const payload = buildJsonPayload(form, controller, primaryToken);
      for (const [key, value] of Object.entries(tokens)) payload[key] = value;
      return {
        url: form.getAttribute('action') || endpoint,
        init: {
          method: config.submit.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      };
    },
    response: (c, ok, body) => {
      if (!ok || !body || !body.success) {
        failed = true;
        if (controller.setServerErrors && body && body.errors) controller.setServerErrors(body.errors);
        showError(responseError(body));
        if (Captcha && body && String(body.code || '').indexOf('E_CAPTCHA') === 0) {
          const retryNotice = retryNoticeEl();
          if (retryNotice) retryNotice.classList.remove('d-none');
        }
        return;
      }
      setGroupsVisible(false);
      const notice = noticeEl();
      if (notice) notice.classList.add('d-none');
      showSuccess();
      if (submitBtn) submitBtn.classList.add('d-none');
      applySuccessHooks();
    },
    error: () => { failed = true; },
    finish: () => { if (failed) restoreSubmit(); },
  });

  // `state` is shared with the runtime; the modal keeps its own lifecycle flags
  // in the DOM, but exposing the reference keeps the handle shape consistent.
  void state;

  return {
    form,
    controller,
    binder: ctx.binder,
    reset: resetForm,
    mountCaptcha,
    unmountCaptcha,
    config,
    name,
    data,
  };
}
