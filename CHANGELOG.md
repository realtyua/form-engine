# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
