# Theming Guide

Form Engine ships with two built-in themes — **Bootstrap 4** and **Tailwind** — and supports custom themes via a theme-neutral hook system.

---

## Built-In Themes

| Theme | Config Value | Use When |
|-------|--------------|----------|
| **Bootstrap 4** | `theme: bootstrap4` | Existing Bootstrap 4 site, IE11 support needed |
| **Tailwind** | `theme: tailwind` | Utility-first CSS, modern stack, purge-friendly |

Switch themes by changing one line in your form config:

```yaml
theme: tailwind   # or bootstrap4
```

The baked fragment and runtime both respect this — no code changes needed.

---

## How Themes Work

A theme is a single ES module exporting an object with these keys:

```js
export const myTheme = {
  name: 'my-theme',                    // Required. Theme identifier

  form(model, ctx) {                   // Required. Render full <form>
    return `<form ...>${steps}</form>`;
  },

  field: renderField,                  // Required. Field renderer fn(field, ctx)

  // Optional overrides (have defaults):
  labelHtml,                           // fn(field, ctx) -> <label>...
  requiredMarker,                      // fn(field, ctx) -> <span data-required-marker>...
  helperHtml,                          // fn(field) -> <small>...
  feedbackHtml,                        // fn(field, ctx) -> valid + invalid feedback
  controlAttrs,                        // fn(field, opts) -> attribute string
  addon,                               // fn(field, side) -> prepend/append HTML
  colClass,                            // fn(colString, ctx) -> CSS class for column
  validationClasses,                   // { invalid: 'is-invalid', valid: 'is-valid' }
  chrome,                              // fn(opts) -> { top, bottom } wizard chrome
  modals,                              // fn(list, opts) -> modal HTML
  navTokens,                           // { current: [...], done: [...], todo: [...] }
};
```

The renderer calls these functions; your theme never touches the data model, validation, or glue logic.

---

## Theme-Neutral Hooks (G-2)

The runtime, page glue, and controller select elements by **data attributes** and **hook classes** that every theme must emit. These are the contract between theme and JS:

### Required Data Attributes

| Hook | Purpose | Emitted By |
|------|---------|------------|
| `data-field="name"` | Binder finds control | `controlAttrs()` |
| `data-field-group` | Wrapper for label/control/help/feedback | `field()` |
| `data-depends="[...]"` | Visibility conditions on wrapper | `field()` |
| `data-required-marker="name"` | Required asterisk toggle | `requiredMarker()` |
| `data-step="N"` | Wizard step container | `chrome()` |
| `data-step-title="N"` | Step title | `chrome()` |
| `data-step-nav="N"` | Step indicator dot | `chrome()` |
| `data-step-prev/next/submit` | Navigation buttons | `chrome()` |
| `data-submit-label/busy` | Submit button text/spinner | `chrome()` |
| `data-submitted-block/error-block` | Result panels | `chrome()` |
| `data-widget="type"` | Widget wrapper | `widgetShell()` |
| `data-location-field/root` | Location cascade selects | `widgetLocation()` |
| `data-captcha-field` | Captcha box | `widgetCaptcha()` |
| `data-map-address/coords` | Map marker info | `widgetMap()` |

### Required Hook Classes (State)

| Class | Purpose | Default (Bootstrap) | Tailwind |
|-------|---------|---------------------|----------|
| `.is-invalid` | Control invalid state | `is-invalid` | `is-invalid` |
| `.is-valid` | Control valid state | `is-valid` | `is-valid` |
| `.valid-feedback` | Valid hint (shown via `.is-valid`) | `valid-feedback` | `valid-feedback` |
| `.invalid-feedback` | Invalid hint (shown via `.is-invalid`) | `invalid-feedback` | `invalid-feedback` |

### Glue Hook Classes (Page Scripts)

These are selected by `app.js` glue modules. Themes emit them as **empty tokens** (no styling) so the glue CSS can target them.

| Class | Used By |
|-------|---------|
| `.custom-file` | File upload glue |
| `.custom-file-label` | File label rewrite |
| `.custom-file-actions` | File validation glyphs |
| `.dropdown-menu` | Autocomplete dropdown |
| `.dropdown-item` | Autocomplete options |
| `.alert`, `.alert-info`, `.alert-warning` | Captcha local/error notices |
| `.btn-clear` | Clear button (text inputs, autocomplete, file) |
| `.mt-2` (on location summary) | Location summary panel |

> **Rule:** Never add Alpine attributes (`x-*`, `@*`, `:*`) to theme output. The controller uses `data-*` hooks and class toggles only.

---

## Extending a Built-In Theme

### 1. Override Tokens (Recommended)

Pass a `themeTokens` object to `bindForm()` in your page glue. This is the simplest way to customize colors, spacing, or validation classes without writing a full theme.

```js
// In your page glue (app.js or inline script)
import { bindForm } from '/assets/js/form-engine/app.js';

bindForm('#my-form-form', {
  themeTokens: {
    // Validation classes (binder toggles these)
    validationClasses: {
      invalid: 'my-invalid',
      valid: 'my-valid',
    },
    // Nav tokens (wizard step indicator)
    navTokens: {
      current: ['bg-amber-500', 'text-white'],
      done: ['bg-green-600', 'text-white'],
      todo: ['bg-gray-300', 'text-gray-700'],
    },
    // Chrome copy (if not in config.chrome)
    chromeCopy: {
      previous: 'Назад',
      next: 'Вперед',
      submit: 'Відправити',
      sending: 'Чекайте...',
    },
  },
});
```

The theme's `colClass`, `controlAttrs`, etc. will use these tokens where applicable.

### 2. Extend the Theme Module

Create a new theme file that imports and wraps the built-in one:

```js
// themes/my-tailwind.js
import { tailwind } from './tailwind.js';
import { classes } from '../html.js';

// Override just the control style
const MY_CONTROL =
  'block w-full rounded-lg border border-gray-400 bg-white px-4 py-2 ' +
  'text-base text-gray-800 placeholder-gray-500 shadow-sm ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

export const myTailwind = {
  ...tailwind,
  name: 'my-tailwind',
  // The renderer calls theme.field(field, ctx) which uses CONTROL internally.
  // To override, you can either:
  // a) Re-export a modified field renderer (see below)
  // b) Pass themeTokens to bindForm (simpler)
};

// Or override field renderer entirely:
import { renderField as baseRenderField } from './tailwind.js';

export function renderField(field, ctx) {
  // Custom logic before/after base
  return baseRenderField(field, ctx);
}
```

Then register it in your page glue:

```js
import { myTailwind } from '/assets/js/form-engine/themes/my-tailwind.js';
import { bindForm } from '/assets/js/form-engine/app.js';

bindForm('#my-form-form', { theme: myTailwind });
```

### 3. Full Custom Theme

Copy `runtime/themes/tailwind.js` or `bootstrap4.js` as a starting point. The file is self-contained (~1000 lines) with clear sections:

- **Tokens** (lines 30-100): CSS class strings for every UI piece
- **Layout** (lines 100-215): Grid translation, utility mapping
- **Label parts** (lines 260-300): Label, required marker, helper
- **Feedback** (lines 318-336): Valid/invalid hint rendering
- **Control attrs** (lines 338-380): Shared input attributes
- **Addons** (lines 383-403): Prepend/append buttons
- **Field types** (lines 405-595): text, select, radio, checkbox, autocomplete, file, hidden
- **Widgets** (lines 597-723): captcha, map, price_info, location
- **Content types** (lines 744-803): heading, paragraph, list, alert, badge, image, raw
- **Field composition** (lines 807-841): Wrappers, depends, colClass
- **Layout** (lines 843-863): Row/column rendering
- **Chrome** (lines 871-954): Wizard step indicator, titles, nav, submit, result blocks
- **Modals** (lines 956-973): Addon modals
- **Export** (lines 975-1007): Theme object

---

## CSS Integration

### Bootstrap 4 Theme

Include Bootstrap 4 CSS in your layout:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
```

The theme uses standard Bootstrap 4 classes (`form-control`, `form-text`, `valid-feedback`, `btn`, `alert`, `custom-file`, etc.). No extra CSS needed.

### Tailwind Theme

Include Tailwind CSS (CDN for demo, build step for production):

```html
<!-- CDN (JIT, not for production) -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Or prebuilt CSS -->
<link rel="stylesheet" href="/assets/css/tailwind.css">
```

The theme emits Tailwind utilities directly. For production, add the theme's `SAFELIST` to your `tailwind.config.js` purge content:

```js
// tailwind.config.js
import { SAFELIST } from './node_modules/form-engine/runtime/themes/tailwind.js';

export default {
  content: [
    './src/**/*.{html,js,njk}',
    './node_modules/form-engine/runtime/themes/tailwind.js', // scans SAFELIST
  ],
  safelist: SAFELIST.split(' '),
  // ...
};
```

The `SAFELIST` contains all responsive column spans (`md:col-span-6`, etc.) and modal sizes that are composed at runtime and would otherwise be purged.

---

## Theme-Aware Widgets

Widgets (`captcha`, `location`, `map`, `price_info`) are rendered by the theme. Both built-in themes emit the same **data-* hooks** and **hook classes** so the page glue works identically.

### Captcha Widget Hooks

| Hook | Purpose |
|------|---------|
| `data-captcha-field="name"` | Captcha box root |
| `data-captcha-theme/size/appearance` | Turnstile config |
| `.alert.alert-info` | "Turnstile skipped (local mode)" |
| `.alert.alert-warning` + `button[data-captcha-retry]` | Load error + retry |

### Location Widget Hooks

| Hook | Purpose |
|------|---------|
| `data-location-root="widgetName"` | Widget wrapper |
| `data-location-field="oblast"` | Each sub-field select |
| `data-location-search="oblast"` | Each sub-field search input |
| `data-location-dropdown="oblast"` | Dropdown menu |
| `data-location-summary="settlement"` | Summary panel |
| `.mt-2` on summary panel | Glue target |

### Map Widget Hooks

| Hook | Purpose |
|------|---------|
| `data-map-address="name"` | Address text |
| `data-map-coords="name"` | Lat/lng text |
| `data-map-fallback` | Fallback address element |
| `.map-picker-responsive` | Picker container (responsive height) |

### Price Info Widget Hooks

| Hook | Purpose |
|------|---------|
| `data-price-info="name"` | Price per m² display |

---

## Validation Classes Customization

The binder adds `is-invalid` / `is-valid` to controls. The theme's `validationClasses` tells the binder which classes to use:

```js
// Default (both themes)
validationClasses: { invalid: 'is-invalid', valid: 'is-valid' }

// Custom (e.g., for a third theme using different class names)
validationClasses: { invalid: 'field-error', valid: 'field-ok' }
```

The theme's feedback elements (`.valid-feedback`, `.invalid-feedback`) must be siblings of the control and work with these classes via CSS (Bootstrap) or the binder's inline `display` toggle (Tailwind).

---

## Creating a Third Theme (Checklist)

1. Copy `runtime/themes/tailwind.js` → `runtime/themes/my-theme.js`
2. Change `name: 'my-theme'`
3. Replace all token constants (ROW, GROUP, LABEL, CONTROL, VALID, INVALID, etc.)
4. Update `colClass` to translate your grid vocabulary
5. Update `chrome()` and `modals()` markup and tokens
6. Ensure all **Required Data Attributes** are emitted
7. Ensure all **Required Hook Classes** are emitted (or mapped via `validationClasses`)
8. Ensure all **Glue Hook Classes** are present as empty tokens
9. Test with `node --test test/theme-render-parity.test.mjs` (adds parity tests for your theme)
10. Register in page glue: `bindForm('#form', { theme: myTheme })`

---

## Dark Mode

Both themes support dark mode via the captcha widget's `theme` config and CSS variables. For full dark mode, extend the theme tokens:

```js
// In your extended theme
const CONTROL_DARK =
  'block w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 ' +
  'text-gray-100 placeholder-gray-400 shadow-sm ' +
  'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

// Use CSS variables or a dark variant class on <html> to swap tokens at runtime
```

---

## Migration from Legacy Partials

If you're migrating from Jekyll `_includes/form/**` partials:

| Legacy Partial | Theme Equivalent |
|----------------|------------------|
| `form/text.html` | `textLike()` in theme |
| `form/select.html` | `select()` in theme |
| `form/checkbox.html` | `checkbox()` in theme |
| `form/autocomplete.html` | `autocomplete()` in theme |
| `form/file.html` | `file()` in theme |
| `form/location.html` | `widgetLocation()` in theme |
| `form/map.html` | `widgetMap()` in theme |
| `form/captcha.html` | `widgetCaptcha()` in theme |
| `form/price_info.html` | `widgetPriceInfo()` in theme |
| `form/wizard.html` | `chrome()` in theme |
| `form/modal.html` | `modals()` in theme |

The declarative config replaces all partial logic. See [Migration Guide](migration-guide.md).