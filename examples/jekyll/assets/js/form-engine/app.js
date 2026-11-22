// Single runtime entry for the form engine.
//
// Discovers every config island on the page and boots it: a page form runs the
// wizard wiring, a modal form (behavior.mode: 'modal' in the config) runs the
// modal wiring. Both contexts share the same controller, binder and submit code;
// app.js only picks the two profiles and starts the one shared boot engine.

import { bootForms } from './form-runtime.js';
import { pageProfile } from './page-form.js';
import { modalProfile } from './modal-form.js';
import { bindModals } from './modals.js';

export function boot(root = document, opts = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  bindModals(root);
  return bootForms(root, {
    ...opts,
    profiles: { page: pageProfile, modal: modalProfile },
  });
}

export default boot;

// The entry self-boots: the page loads this one module (a <script type=module>)
// and every config island it ships is mounted and wired. A page without islands
// is a no-op.
if (typeof document !== 'undefined') {
  const start = () => boot(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
