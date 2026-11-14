# Form Engine

> Declarative form engine with Jekyll and Eleventy adapters — zero-API, YAML-driven, two themes.

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#scripts--gates)
[![Tests](https://img.shields.io/badge/tests-183%2F183-brightgreen)](#scripts--gates)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](#installation)

---

## Quick Links

| Resource | Description |
| --- | --- |
| [Jekyll Example](examples/jekyll/) | Self-contained Jekyll site with Bootstrap 4 theme |
| [Eleventy Example](examples/eleventy/) | Self-contained 11ty site with Tailwind theme |
| [Config Reference](docs/config-reference.md) | Complete YAML schema (PUB-9) |
| [Theming Guide](docs/theming.md) | Bootstrap 4 / Tailwind customization (PUB-9) |
| [Migration Guide](docs/migration.md) | From legacy partials to declarative (PUB-9) |

---

## Installation

Form Engine is published as a private package. Until the public release (PUB-10), install from GitHub:

```sh
# From GitHub (requires auth for private repo)
npm install github:your-org/form-engine#v1.0.0

# Or locally during development
npm install /path/to/form-engine
```

**Peer dependencies** (provided by the host site):
- Jekyll site: Ruby ≥ 3.1, `jekyll` gem, `js-yaml` (for Node tools)
- Eleventy site: Node ≥ 20, `@11ty/eleventy`, `js-yaml`

The package itself has **zero runtime dependencies** — the runtime is plain ES modules.

---

## Getting Started — Jekyll (Bootstrap 4)

### 1. Minimal Gemfile

```ruby
# Gemfile
source "https://rubygems.org"
gem "jekyll", "~> 4.3"
gem "webrick"   # required for Ruby ≥ 3
```

### 2. Site configuration (`_config.yml`)

```yaml
# _config.yml
baseurl: ""
demo_endpoint: "/api/demo"
turnstile_enabled: false

# Currency rates for price_info widget
usd: 41.50
eur: 45.20
nbu: 41.30
```

### 3. Form config (`_data/demo.yml`)

```yaml
# _data/demo.yml
version: 1
id: demo
theme: bootstrap4
settings:
  submit:
    action: "{{ site.demo_endpoint }}"
    method: POST
steps:
  - fields:
      - name: email
        type: email
        label: Email
        required: true
      - name: message
        type: textarea
        label: Message
        required: true
```

### 4. Layout (`_layouts/default.html`)

```html
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <title>{{ page.title | default: site.title }}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Bootstrap 4 CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
</head>
<body>
  <main class="container py-4">
    {{ content }}
  </main>
  <!-- Form Engine runtime (baked by plugin) -->
  <script src="/assets/js/form-engine/app.js?v={{ site.github.build_revision }}"></script>
</body>
</html>
```

### 5. Page with form (`demo.html`)

```html
---
layout: default
title: Demo Form
---
<h1>Demo Form</h1>

{% include form/app/demo.html %}
```

### 6. Copy adapter files

```sh
# From form-engine package root:
cp -r adapters/jekyll/_plugins _plugins
cp -r adapters/jekyll/tools _form-engine/tools
cp -r adapters/jekyll/schema _form-engine/schema
cp -r runtime assets/js/form-engine
```

### 7. Build & serve

```sh
bundle install
bundle exec jekyll serve   # → http://127.0.0.1:4000/demo.html
```

The `_plugins/form_engine.rb` hook runs on every build:
1. Validates `_data/*.yml` against the JSON Schema
2. Bakes each form into `_includes/form/app/<name>.html`

> **See also:** [`examples/jekyll/README.md`](examples/jekyll/README.md) — complete working example with Chrome copy (`_data/uk.yml`), landing page, and offline validation commands.

---

## Getting Started — Eleventy / 11ty (Tailwind)

### 1. `package.json`

```json
{
  "name": "my-11ty-site",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "eleventy",
    "serve": "eleventy --serve"
  },
  "dependencies": {
    "@11ty/eleventy": "^3.0.0",
    "js-yaml": "^4.1.0",
    "form-engine": "file:../form-engine"
  }
}
```

### 2. Eleventy config (`.eleventy.js`)

```js
// .eleventy.js
import formEngine from "form-engine/adapters/eleventy/lib/form-engine.js";

export default function (eleventyConfig) {
  // Passthrough copy the runtime (served at /assets/js/form-engine/)
  eleventyConfig.addPassthroughCopy({
    "node_modules/form-engine/runtime": "assets/js/form-engine"
  });

  // Register forms before build
  eleventyConfig.on("beforeBuild", async () => {
    await formEngine.registerForms(eleventyConfig);
  });
}
```

### 3. Site data (`src/_data/site.js`)

```js
// src/_data/site.js
export default {
  demoEndpoint: "/api/demo"
};
```

### 4. Form config (`src/_data/demo.yml`)

```yaml
# src/_data/demo.yml
version: 1
id: demo
theme: tailwind
settings:
  submit:
    action: "{{ demoEndpoint }}"
    method: POST
steps:
  - fields:
      - name: email
        type: email
        label: Email
        required: true
      - name: message
        type: textarea
        label: Message
        required: true
```

### 5. Layout (`src/_includes/layouts/default.njk`)

```njk
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <title>{{ title }}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Tailwind CSS (via CDN for demo; use build step in production) -->
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <main class="container mx-auto py-8 px-4">
    {{ content | safe }}
  </main>
  <!-- Form Engine runtime (copied by passthrough) -->
  <script src="/assets/js/form-engine/app.js"></script>
</body>
</html>
```

### 6. Page with form (`src/demo.njk`)

```njk
---
layout: layouts/default.njk
title: Demo Form
---
<h1 class="text-2xl font-bold mb-6">Demo Form</h1>

{% formApp "demo" %}
```

### 7. Build & serve

```sh
npm install
npm run serve   # → http://localhost:8080/demo/
```

The adapter's `registerForms()` hook runs at `beforeBuild`:
1. Validates `src/_data/*.yml` against the JSON Schema
2. Bakes each form and registers `{% formApp "<name>" %}` shortcode

> **See also:** [`examples/eleventy/README.md`](examples/eleventy/README.md) — complete working example with shortcode registration, landing page, and offline validation.

---

## Architecture Overview

```
form-engine/
├── runtime/                    # Framework-agnostic core (ES modules)
│   ├── app.js                  # Entry point: bootPage / bootModal
│   ├── render.js               # Renderer: steps → HTML (theme-neutral)
│   ├── shell.js                # FormController + FormBinder
│   ├── binder.js               # Data binding, validation, depends
│   ├── themes/
│   │   ├── tailwind.js         # Tailwind markup + CSS tokens
│   │   └── bootstrap4.js       # Bootstrap 4 markup + CSS tokens
│   └── glues/                  # Page glue: autocomplete, map, captcha, file
├── adapters/
│   ├── jekyll/
│   │   ├── _plugins/form_engine.rb   # Bake hook (build-time)
│   │   └── tools/                    # gen-form-app, validate, site-opts
│   └── eleventy/
│       └── lib/form-engine.js        # beforeBuild hook + {% formApp %}
├── tools/                      # CLI tools (Node)
│   ├── validate-config.mjs     # Schema validation (--strict)
│   ├── gen-form-app.mjs        # Bake a single form fragment
│   ├── check-add-property.mjs  # Golden-file render test
│   ├── check-notify.mjs        # Notify modal golden-file test
│   └── yaml.mjs                # YAML loader (js-yaml wrapper)
├── schema/
│   └── form-config.schema.json # JSON Schema for form YAML
├── test/                       # node --test suite (183 tests)
├── examples/
│   ├── jekyll/                 # Self-contained Jekyll + Bootstrap 4
│   └── eleventy/               # Self-contained 11ty + Tailwind
├── LICENSE                     # MIT
├── NOTICE                      # Attribution notices
└── package.json                # Private package manifest
```

**Key principles:**
- **One config = one form** — YAML in `_data/` (Jekyll) or `src/_data/` (11ty)
- **Site-specific values stay in the adapter** — endpoints, copy, rates, Turnstile keys
- **Themes are pure markup + CSS tokens** — no Alpine, no framework leakage
- **Bake at build time** — zero client-side templating; runtime only binds data

---

## Themes

| Theme | Package | Use when… |
| --- | --- | --- |
| **Tailwind** | `theme: tailwind` | Utility-first CSS, modern stack, purge-friendly |
| **Bootstrap 4** | `theme: bootstrap4` | Existing Bootstrap 4 site, IE11 support needed |

**Switching themes:** Change `theme` in your form YAML. The baked fragment and runtime both respect it — no code changes needed.

**Customizing:** Extend `themeTokens` in your config (see [Theming Guide](docs/theming.md) — PUB-9).

---

## Scripts & Gates

Run from the **package root** (`form-engine/`):

| Command | Purpose |
| --- | --- |
| `npm test` | Full test suite (183 tests) |
| `node tools/validate-config.mjs <path> --strict` | Validate form YAML against schema |
| `node tools/check-add-property.mjs` | Golden-file render test (add-property) |
| `node tools/check-notify.mjs` | Golden-file render test (notify modal) |
| `node --test test/examples.test.mjs` | Examples contract tests (7 tests) |

**Jekyll-only (from site root):**
```sh
node _form-engine/tools/gen-form-app.mjs --name demo --data _data/demo.yml --out _includes/form/app/demo.html
powershell -File _form-engine/tools/verify-render.ps1 verify
```

**Eleventy-only:**
```sh
npm run build
```

---

## Config Reference, Theming, Migration

Detailed documentation is maintained in `docs/` (PUB-9):

- [`docs/config-reference.md`](docs/config-reference.md) — Complete YAML schema with examples
- [`docs/theming.md`](docs/theming.md) — Theme tokens, custom CSS, extending widgets
- [`docs/migration.md`](docs/migration.md) — From legacy `_includes/form/**` partials to declarative forms

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-change`
3. Make changes **only in the relevant layer** (runtime / theme / adapter / config / tests / docs)
4. Run gates: `npm test` + relevant adapter gates
5. Submit a PR with a clear description

**Code style:** UTF-8 without BOM, 2-space indent, ES modules, no Alpine attributes in render output.

---

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

---

*Form Engine — declarative forms for static sites. Built for realty.ua & reifua.*