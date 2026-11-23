# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.9] - 2026-11-23

### Added

- `runtime/page-form.js`: shared page-form glue for widgets (`location`, `autocomplete`, `map`, `price_info`, `captcha`, file handling, wizard navigation) reused by modal profile.
- `runtime/modal-form.js`: modal lifecycle, status, captcha gate; reuses widget glue with `{ wireSubmit: false, wireActions: false, captcha: false }`.
- `runtime/form-runtime.js`: unified boot dispatcher by `behavior.mode` (`page` | `modal`).
- `runtime/submit.js`: `buildJsonPayload()` for modal profile; `buildPayload`/`toFormData` for page profile.
- Schema: `submit.encoding` (`multipart` | `json`) with documented defaults (page→multipart, modal→json; file widget forces multipart).
- Docs: `config-reference.md`, `migration-guide.md` updated for encoding precedence and page/modal parity.

### Changed

- Map picker id derived from widget `element_id`/`name` + `-picker` (no production literals).
- Example runtimes and Jekyll/Eleventy adapters synced to package runtime (MOD-16 follow-up).

## [1.0.8] - 2026-11-20

### Fixed

- `tools/check-add-property.mjs` and both adapter copies now derive
  autocomplete and location expectations from the config (`type: autocomplete`,
  `type: widgets` + `widget: location`) instead of hard-coded field names, so
  renaming a field no longer breaks the gate (MOD-14).
- All three wrappers share `tools/check-add-property-core.mjs`. A regression
  test checks renamed fields and forbids the retired literals in gate sources.

## [1.0.7] - 2026-11-19

### Fixed

- `runtime/modal-form.js`: sync captcha solved state and token with the
  controller (poll/watch and sync before validation) for config-driven modal
  captcha widgets so Turnstile success is recognized on submit (e.g.
  `element_id: captcha`), preventing false "confirm you are not a robot"
  errors (MOD-9 follow-up).

## [1.0.6] - 2026-11-19

### Fixed

- `runtime/modal-form.js`: config-driven modal boot for `behavior.mode: modal`
  forms (captcha widget fields via `element_id`/`action`/`token`, submit/status
  handling, page-context prefill, `dnscheck` for configured email fields, and
  legacy `notify-*` compatibility) to support target notify configs (MOD-9).
- `runtime/shell.js`: modal island now includes `id`, `version`, and `behavior`
  so modal boot/check contracts receive full config metadata.
- `adapters/jekyll/tools/check-notify.mjs`: captcha asset checks are conditional
  for modal-baked pages when Turnstile assets are not emitted, while still
  requiring single includes when present.

## [1.0.5] - 2026-11-19

### Added

- `runtime/shell.js`: exported `renderAssets(config, opts)` with the shared
  captcha-asset gate and `renderModal(config, opts)` that bakes a modal form
  fragment (config island, captcha assets when applicable, theme style, empty
  mount point, and `app.js` loader) without wizard chrome or pre-rendered form
  markup (MOD-9).
- `adapters/jekyll/tools/gen-form-app.mjs`: bakes `renderModal` output for
  configs with `behavior.mode: modal`.

### Changed

- `adapters/jekyll/tools/check-notify.mjs`: requires a `widget: captcha` field
  in the notify config and asserts exactly one `TURNSTILE_CONFIG`,
  `form-engine/captcha.js`, Turnstile `api.js`, and `form-engine/app.js` include
  per checked page (no duplicates).

## [1.0.4] - 2026-11-18

### Fixed

- `runtime/page-form.js`: hovering an autocomplete or location result no longer
  rebuilds the dropdown. Replacing the node under the pointer made Chromium fire
  `mouseenter` on its replacement over and over, so a mouse click never reached
  the pick handler while keyboard selection kept working. Hover now repaints the
  highlight in place and keeps the result clickable (PUB-18).

## [1.0.3] - 2026-11-18

### Fixed

- `adapters/jekyll/tools/check-add-property.mjs` now imports `resolve` from
  `node:path`. Version 1.0.2 moved the tool onto `paths.mjs` and dropped the
  identifier from the import list, so the gate crashed at load time with
  `ReferenceError: resolve is not defined` instead of running.

## [1.0.2] - 2026-11-17

### Fixed

- Jekyll adapter tools (`validate-config`, `gen-form-app`, `check-add-property`,
  `check-notify`) now resolve the site root, the schema and the runtime modules
  both when they live inside a site (`_form-engine/tools`) and when they are
  consumed from the installed package. Shared resolution lives in
  `adapters/jekyll/tools/paths.mjs` (PUB-13 follow-up).

## [1.0.1] - 2026-11-15

### Fixed

- `runtime/package.json` (`{"type":"module"}`) now ships with the package, so a
  host site that copies `runtime/` out of the tarball loads it as ES modules
  without creating the marker by hand. Without it the Jekyll bake tool failed
  with `Named export 'renderPage' not found` (PUB-12 F1).
- Eleventy adapter (`adapters/eleventy/lib/form-engine.js`) rewritten as ESM
  (`import`/`export default`) with optional `opts` (`engineDir`, `dataDir`,
  `siteDir`, `site`) so it can be imported directly from the package and does
  not depend on site-specific paths (PUB-12 F3, F4).
- README / migration guide / theming guide: all passthrough and copy paths
  updated to `@realtyua/form-engine` (scoped name); schema copy path fixed to
  root `schema/` (PUB-12 F2, F5).
- Dependency statement clarified: runtime is zero-deps; tools/adapters pull
  `iconv-lite`, `js-yaml`, `linkedom` (PUB-12 F6).

## [1.0.0] - 2026-11-13

First release of the standalone Form Engine package.

### Added

- `runtime/` — framework-agnostic ES-module engine: config-island discovery,
  page and modal boot, controller, binder, validation, conditions, layout,
  submit and HTML helpers.
- `runtime/themes/` — Bootstrap 4 and Tailwind themes that emit the same ids,
  names and `data-*` hooks (markup + CSS).
- `adapters/jekyll/` — Jekyll plugin (`_plugins/form_engine.rb`) and build
  tools (bake, validate, gates, render verification).
- `adapters/eleventy/` — Eleventy `formApp` shortcode plugin and build tools
  (validate, gates, engine manifest).
- `tools/` — platform-agnostic CLI tools: `validate-config`, `yaml`,
  `check-add-property`, `check-notify`.
- `schema/form-config.schema.json` — JSON Schema (draft-07 subset) for form
  configs.
- `test/` — Node `node --test` suite.
- `package.json` `exports` map for the runtime, schema and adapters.
- `CHANGELOG.md`.

[Unreleased]: https://github.com/realtyua/form-engine/compare/v1.0.7...HEAD
[1.0.7]: https://github.com/realtyua/form-engine/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/realtyua/form-engine/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/realtyua/form-engine/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/realtyua/form-engine/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/realtyua/form-engine/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/realtyua/form-engine/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/realtyua/form-engine/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/realtyua/form-engine/releases/tag/v1.0.0
