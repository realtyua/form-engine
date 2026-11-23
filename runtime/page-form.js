// Page profile of the shared form boot. All widget behaviour (location,
// autocomplete, map, price_info, files, captcha and wizard chrome) lives in the
// shared widget glue so the same config can also boot in a modal.

import { buildData } from './data.js';
import { bootForm } from './form-runtime.js';
import { setupWidgets } from './widget-glue.js';

export const pageProfile = {
  mode: 'page',
  payloadEncoding: 'multipart',
  submitMethod: () => 'POST',
  controllerOpts: (config) => ({ data: buildData(config) }),
  setup: (ctx) => setupWidgets(ctx),
};

export function bootPage(root, opts = {}) {
  return bootForm(root, { ...opts, mode: 'page', profile: pageProfile });
}
