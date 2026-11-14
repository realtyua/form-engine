# Migration Guide

Guide for migrating from legacy Jekyll/Alpine partials (`_includes/form/**`) or Eleventy shortcodes to the declarative Form Engine.

---

## Why Migrate?

| Legacy Approach | Form Engine |
|-----------------|-------------|
| Scattered partials (`_includes/form/text.html`, `select.html`, etc.) | Single YAML config per form |
| Alpine directives in markup (`x-model`, `:class`, `@change`) | Zero Alpine in output; `data-*` hooks + vanilla controller |
| Runtime templating (Liquid/Nunjucks loops) | Build-time bake → static fragment + hydration |
| Site-specific values mixed in partials (endpoints, copy, rates) | Config-only; site values via adapter (`site-opts.mjs`, `lib/form-engine.js`) |
| Hard to test, diff, review | `validate-config --strict`, golden-file render tests, parity gates |

---

## Migration Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  LEGACY (Jekyll)                                                │
│  ────────                                                       │
│  _data/add-property.yml          ← Already declarative!         │
│  _includes/form/app/add-property.html  ← Generated (baked)      │
│  _includes/form/text.html        ← Legacy partial (DELETE)      │
│  _includes/form/select.html      ← Legacy partial (DELETE)      │
│  ... 20+ partials                                                 │
│                                                                 │
│  {% include form/app/add-property.html %}  ← Page opts in      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FORM ENGINE (Declarative)                                      │
│  ───────────────────────                                        │
│  _data/add-property.yml          ← Source of truth (edit this)  │
│  _includes/form/app/add-property.html  ← Baked by plugin       │
│  _plugins/form_engine.rb         ← Bake hook (build-time)       │
│  assets/js/form-engine/          ← Runtime (ES modules)         │
│                                                                 │
│  {% include form/app/add-property.html %}  ← Page opts in      │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** If you already have `_data/*.yml` configs, you're 80% there. The bake step just makes it official.

---

## Phase 1: Inventory Your Partials

List every `_includes/form/*.html` partial your site uses:

```sh
find _includes/form -name '*.html' -type f | sort
```

Typical legacy partials:

| Partial | Purpose | Form Engine Replacement |
|---------|---------|------------------------|
| `text.html` | `<input type="text|email|tel|...">` | `type: text\|email\|tel\|number` |
| `textarea.html` | `<textarea>` | `type: textarea` |
| `select.html` | `<select>` | `type: select` |
| `radio.html` | Radio group | `type: radio` |
| `checkbox.html` | Single checkbox | `type: checkbox` |
| `checkbox_group.html` | Toggle button group | `type: checkbox_group` |
| `autocomplete.html` | Search + select | `type: autocomplete` |
| `file.html` | File upload | `type: file` |
| `location.html` | Oblast → raion → settlement cascade | `type: widgets, widget: location` |
| `map.html` | Leaflet picker | `type: widgets, widget: map` |
| `captcha.html` | Turnstile | `type: widgets, widget: captcha` |
| `price_info.html` | Price per m² card | `type: widgets, widget: price_info` |
| `wizard.html` | Step indicator, nav, submit | `chrome` in theme / config |
| `modal.html` | Addon modals (prepend/append) | `modals` in theme |
| `attributes.html` | Shared input attributes | `controlAttrs()` in theme |
| `label.html` | Label + required marker | `labelHtml()` + `requiredMarker()` |
| `feedback.html` | Valid/invalid hints | `feedbackHtml()` |
| `row.html` / `col.html` | Grid layout | `rows` / `cols` in config |

---

## Phase 2: Convert Partials to Config

### Step 1: Create/Verify `_data/<form>.yml`

Your existing `_data/add-property.yml` is likely already valid. Validate it:

```sh
node _form-engine/tools/validate-config.mjs _data/add-property.yml --strict
```

### Step 2: Map Each Partial to Field Config

For each field in your old partials, create a field entry in the YAML `steps[].rows[].fields[]`.

#### Text Input → `type: text`

**Legacy (`_includes/form/text.html`):**
```html
<input type="text"
  id="field_{{ name }}"
  name="{{ name }}"
  value="{{ value }}"
  class="form-control{% if error %} is-invalid{% endif %}"
  {% if required %}required{% endif %}
  {% if placeholder %}placeholder="{{ placeholder }}"{% endif %}
  {% if maxlength %}maxlength="{{ maxlength }}"{% endif %}>
```

**Config:**
```yaml
- name: "full_name"
  type: "text"
  required: true
  label: "Повне ім'я"
  placeholder: "Іван Петренко"
  maxlength: 100
  col: "col-12 col-md-6"
```

#### Select → `type: select`

**Legacy:**
```html
<select id="field_{{ name }}" name="{{ name }}" class="form-control">
  <option value="">{{ placeholder }}</option>
  {% for option in options %}
  <option value="{{ option.value }}">{{ option.label }}</option>
  {% endfor %}
</select>
```

**Config:**
```yaml
- name: "topic"
  type: "select"
  required: true
  label: "Тема"
  placeholder: "Оберіть..."
  options:
    - value: "question"
      label: "Запитання"
    - value: "feedback"
      label: "Відгук"
```

#### Autocomplete → `type: autocomplete`

**Legacy (`autocomplete.html`):**
```html
<select id="field_{{ name }}" class="form-control" data-autocomplete-select>
  <option value="">{{ placeholder }}</option>
</select>
<div class="position-relative">
  <input type="text" class="form-control autocomplete-search"
    id="field_{{ name }}_search" placeholder="{{ placeholder }}">
  <button class="btn-clear autocomplete-clear" data-autocomplete-clear>
</div>
```

**Config:**
```yaml
- name: "district"
  type: "autocomplete"
  required: false
  label: "Район"
  placeholder: "Введіть назву..."
  data: "/assets/data/districts.json"
  mode: "auto"
  threshold: 6
  minChars: 2
  maxResults: 6
```

#### Location Cascade → `type: widgets, widget: location`

**Legacy (`location.html`):**
```html
{% for level in ['oblast', 'raion', 'hromada', 'settlement'] %}
  <select id="field_location_{{ level }}" name="location[{{ level }}]" class="form-control">
  ...
  <input type="text" class="form-control location-search" id="field_location_{{ level }}_search">
{% endfor %}
<div data-location-summary></div>
```

**Config:**
```yaml
- name: "location_widget"
  type: "widgets"
  widget: "location"
  data: "/assets/data/all.json"
  settings:
    method: "two"
  fields:
    - name: "oblast"
      parent: null
      children: "raion"
      label: "Область"
      placeholder: "Введіть назву області..."
      required: true
      mode: "auto"
      threshold: 15
      minChars: 2
      maxResults: 6
    - name: "raion"
      parent: "oblast"
      children: "hromada"
      label: "Район"
      # ...
    - name: "hromada"
      parent: "raion"
      children: "settlement"
      # ...
    - name: "settlement"
      parent: "hromada"
      label: "Населений пункт"
      # ...
```

#### Map → `type: widgets, widget: map`

**Legacy (`map.html`):**
```html
<div id="map-picker" class="map-picker-responsive"></div>
<div class="map-marker-info" hidden>...</div>
```

**Config:**
```yaml
- name: "map_widget"
  type: "widgets"
  widget: "map"
  height: 420
  depends:
    - field: "location_widget.settlement"
      value: ">0"
```

#### Captcha → `type: widgets, widget: captcha`

**Legacy (`captcha.html`):**
```html
<div id="captcha-widget" class="captcha-widget-box" data-captcha-field="captcha"></div>
<div class="alert alert-info" hidden>Turnstile пропущено...</div>
<div class="alert alert-warning" hidden>Не вдалося завантажити...<button data-captcha-retry>...</button></div>
```

**Config:**
```yaml
- name: "captcha"
  type: "widgets"
  widget: "captcha"
  theme: "light"
  size: "normal"
  appearance: "always"
```

#### Price Info → `type: widgets, widget: price_info`

**Legacy (`price_info.html`):**
```html
<div class="card" hidden>
  <div class="card-body">
    <small data-price-info></small>
  </div>
</div>
```

**Config:**
```yaml
- name: "price_info_widget"
  type: "widgets"
  widget: "price_info"
  depends:
    - field: "surface"
      value: ">0"
    - field: "price"
      value: ">0"
    - field: "currency"
      value: ">0"
```

### Step 3: Map Layout (Rows/Columns)

Legacy partials used Bootstrap grid classes directly in the template. In config, put them on `col` (field) or `class` (row):

```yaml
rows:
  - class: "row mb-3"           # Row wrapper class
    fields:
      - name: "email"
        type: "email"
        col: "col-12 col-md-6"  # Field column class
      - name: "phone"
        type: "tel"
        col: "col-12 col-md-6"
```

For nested columns (col inside col):

```yaml
rows:
  - class: "row"
    cols:
      - class: "col-12 col-md-6"
        rows:
          - fields:
              - name: "field1"
                col: "col-12"
      - class: "col-12 col-md-6"
        rows:
          - fields:
              - name: "field2"
                col: "col-12"
```

### Step 4: Map Conditions (`depends`)

Legacy used Liquid `{% if %}` or Alpine `x-show`. In config, use `depends`:

```yaml
# Legacy: {% if action_type == 'rent' %}...{% endif %}
- name: "period_rent"
  type: "select"
  depends:
    - field: "action_type"
      values: ["rent"]
```

```yaml
# Legacy: {% unless property_type == 'land' %}...{% endunless %}
- name: "surface"
  type: "number"
  depends:
    - field: "property_type"
      except: ["land"]
```

```yaml
# Legacy: Alpine x-show with complex logic
- name: "parking_surface"
  type: "number"
  depends:
    - field: "property_type"
      values: ["apartment", "house"]
      logic: "and"
    - field: "parking"
      values: ["garage", "space"]
      logic: "and"
```

### Step 5: Map Validation Copy

Legacy had hardcoded Ukrainian strings in partials. Move them to `settings.feedback` (global) or `feedback`/`validation` (per-field):

```yaml
settings:
  feedback:
    valid: "Виглядає наче все добре!"
    invalid: "Будь ласка, заповніть це поле дійсними даними"
    pattern: "Тільки українські літери, цифри та розділові знаки"
    email: "Невірний формат email"

# Per-field override
- name: "email"
  type: "email"
  feedback:
    valid: "Email прийнято"
    invalid: "Це не схоже на email"
```

### Step 6: Map Chrome Copy

Legacy wizard buttons/labels were in `wizard.html` or passed via include parameters. Now in `config.chrome`:

```yaml
chrome:
  previous: "Попереднє"
  next: "Наступне →"
  submit: "Опублікувати"
  sending: "Публікую..."
  successTitle: "Готово!"
  successText: "Ваше оголошення надіслано на модерацію."
  errorTitle: "Помилка"
  errorCode: "Код"
  retry: "Спробувати знову"
  close: "Закрити"
```

Or let the site adapter supply defaults (Jekyll: `_data/uk.yml`, 11ty: `src/_data/site.js`).

---

## Phase 3: Remove Legacy Partials

Once the config validates and renders correctly:

```sh
# Backup first
cp -r _includes/form _includes/form.backup

# Remove legacy partials (keep only generated app/ and any non-form partials)
rm _includes/form/text.html
rm _includes/form/select.html
rm _includes/form/checkbox.html
# ... all legacy partials except:
# _includes/form/app/          (generated, keep)
# _includes/form/attributes.html (if still referenced elsewhere)
# _includes/form/label.html     (if still referenced elsewhere)
```

The `_plugins/form_engine.rb` hook bakes the form into `_includes/form/app/<name>.html` on every build. Your pages already include it:

```liquid
{% include form/app/add-property.html %}
```

No page changes needed.

---

## Phase 4: Update Site Adapter (Jekyll)

Ensure `_plugins/form_engine.rb` and `_form-engine/tools/` are current:

```sh
# From form-engine package root:
cp -r adapters/jekyll/_plugins/form_engine.rb _plugins/
cp -r adapters/jekyll/tools/* _form-engine/tools/
cp -r runtime assets/js/form-engine
```

The plugin:
1. Scans pages for `{% include form/app/<name>.html %}`
2. Validates `_data/<name>.yml` against schema
3. Resolves endpoint (from `submit.action` or `site.<name>_endpoint`)
4. Runs `gen-form-app.mjs` to bake fragment
5. Fragment includes config island + runtime loader

### Site Config (`_config.yml`)

```yaml
baseurl: ""
add_property_endpoint: "/api/add-property"
notify_endpoint: "/api/notify"
demo_endpoint: "/api/demo"
turnstile_enabled: false
turnstile_sitekey: "0x4AAAAAAA"
usd: 41.50
eur: 45.20
nbu: 41.30
```

### Chrome Copy (`_data/uk.yml`)

```yaml
previous: "Попереднє"
next: "Наступне"
notify_submit: "Підписатись"
add_property_success: "Оголошення надіслано"
add_property_success_text: "Дякуємо! Ваше оголошення на модерації."
add_property_error_title: "Не вдалося надіслати"
add_property_error_code: "Код помилки"
add_property_retry: "Спробувати ще раз"
close: "Закрити"
```

The plugin's `site-opts.mjs` reads these and merges into the baked fragment.

---

## Phase 5: Update Site Adapter (Eleventy)

```sh
# From form-engine package root:
cp adapters/eleventy/lib/form-engine.js lib/form-engine.js
cp -r runtime src/assets/js/form-engine
```

### Eleventy Config (`.eleventy.js`)

```js
import formEngine from "./lib/form-engine.js";

export default function (eleventyConfig) {
  // Passthrough runtime
  eleventyConfig.addPassthroughCopy({
    "node_modules/form-engine/runtime": "assets/js/form-engine"
  });

  // Register forms at build time
  eleventyConfig.on("beforeBuild", async () => {
    await formEngine.registerForms(eleventyConfig);
  });
}
```

### Site Data (`src/_data/site.js`)

```js
export default {
  demoEndpoint: "/api/demo",
  // addPropertyEndpoint, notifyEndpoint, etc.
};
```

### Page with Form (`src/demo.njk`)

```njk
---
layout: layouts/default.njk
title: Demo
---
<h1>Demo Form</h1>

{% formApp "demo" %}
```

The adapter registers `{% formApp "name" %}` shortcode that returns the baked fragment.

---

## Phase 6: Verify with Gates

### Config Validation

```sh
node tools/validate-config.mjs _data/add-property.yml --strict
node tools/validate-config.mjs _data/notify.yml --strict
node tools/validate-config.mjs _data/demo.yml --strict
```

### Golden-File Render Tests (Jekyll)

```sh
node _form-engine/tools/check-add-property.mjs
node _form-engine/tools/check-notify.mjs
```

These compare the baked fragment against a frozen baseline. If they pass, your output is identical to the legacy partials.

### Visual Regression (Jekyll)

```sh
powershell -File _form-engine/tools/verify-render.ps1 verify
```

Builds the site (`--limit_posts 1`) and compares rendered HTML against baseline.

### Full Test Suite

```sh
npm test
```

Runs 183 tests: runtime logic, render parity (Bootstrap 4 vs Tailwind), theme hooks, widget behavior, validation, conditions, etc.

---

## Common Migration Issues

### 1. "Unknown key" in `--strict` validation

You have a key in YAML that the schema doesn't know. Either:
- Remove it (was for a partial that no longer exists)
- Check if it's a valid field option (see [Config Reference](config-reference.md))

### 2. Field not rendering

- Field `name` must be unique across the entire form
- Field must be reachable from `steps[].rows[].fields[]`
- `depends` conditions may be hiding it

### 3. Validation not showing

- Ensure `novalidate` is on `<form>` (baked fragment has it)
- Check `validationClasses` match your CSS (default: `is-invalid`/`is-valid`)
- For Tailwind: binder adds classes but doesn't show feedback; CSS must reveal `.invalid-feedback` when `.is-invalid` is present

### 4. Autocomplete not searching

- `data` URL must return JSON array of `{value, label}`
- `mode: "auto"` switches to search when options > `threshold`
- Check browser console for fetch errors

### 5. Location cascade not populating

- `data` URL must return the full hierarchy
- Each sub-field's `parent` must match previous level's `name`
- `children` must match next level's `name`
- `method: "two"` fills ancestors when leaf is picked

### 6. Captcha not loading

- `turnstile_enabled: true` in site config
- Valid `sitekey` in config or site config
- Check `captcha.localHosts` includes your dev domain

### 7. File upload previews not showing

- Glue module (`assets/js/form-engine/glues/file.js`) handles previews
- Ensure runtime is loaded and `bindForm()` called
- Check `file.accept` and `file.multiple` config

---

## Migration Checklist

- [ ] Inventory all `_includes/form/*.html` partials
- [ ] Validate existing `_data/*.yml` with `--strict`
- [ ] Convert each partial field to config field entry
- [ ] Map layout (rows/cols) to config structure
- [ ] Map conditions (`depends`, conditional required/readonly)
- [ ] Move validation copy to `settings.feedback` / field `feedback`
- [ ] Move chrome copy to `config.chrome` or site adapter
- [ ] Update site adapter files (`_plugins/form_engine.rb`, tools)
- [ ] Run `check-add-property.mjs` and `check-notify.mjs`
- [ ] Run `verify-render.ps1 verify`
- [ ] Run `npm test`
- [ ] Remove legacy partials
- [ ] Verify pages still render correctly
- [ ] Commit config + adapter updates (delete partials in same commit)

---

## Eleventy-Specific Notes

| Jekyll | Eleventy |
|--------|----------|
| `_data/form.yml` | `src/_data/form.yml` |
| `_config.yml` endpoints | `src/_data/site.js` endpoints |
| `{% include form/app/x.html %}` | `{% formApp "x" %}` |
| `_plugins/form_engine.rb` | `lib/form-engine.js` + `.eleventy.js` |
| `site-opts.mjs` (build-time) | Adapter reads `site.js` at build-time |
| Ruby + Node | Node only |

The Eleventy adapter is simpler: no bake step per page, just one `beforeBuild` hook that registers all forms as shortcodes.

---

## Rollback Plan

If something breaks:

1. Restore `_includes/form/` from backup
2. Revert `_plugins/form_engine.rb` and `_form-engine/tools/`
3. Revert `assets/js/form-engine/`
4. Pages still work with legacy partials (no config change needed)

The config `_data/*.yml` is forward-compatible — it works with both old partials (if you keep them) and the new engine.