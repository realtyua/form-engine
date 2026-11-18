# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/realtyua/form-engine/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/realtyua/form-engine/releases/tag/v1.0.0
