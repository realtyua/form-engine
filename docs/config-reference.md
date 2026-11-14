# Config Reference

Complete reference for the Form Engine YAML configuration schema (version 1).

The schema is defined in [`schema/form-config.schema.json`](../schema/form-config.schema.json). Validate any config with:

```sh
node tools/validate-config.mjs _data/your-form.yml --strict
```

---

## Top-Level Structure

```yaml
version: 1                    # Required. Schema major version (const: 1)
id: "my-form"                 # Required. Stable form identity [a-z][a-z0-9_-]*
theme: "bootstrap4"           # Optional. "bootstrap4" | "tailwind" (default: bootstrap4)
settings: {}                  # Required. Form-wide defaults
steps: []                     # Required. Ordered wizard steps (min 1)
submit: {}                    # Optional. Submit endpoint & behavior
behavior: {}                  # Optional. Page vs modal mode
chrome: {}                    # Optional. Wizard copy overrides
rates: {}                     # Optional. Currency rates for price_info widget
captcha: {}                   # Optional. Turnstile settings
assets: {}                    # Optional. Script/style paths
```

---

## `settings` — Form-Wide Defaults

All keys optional. Any key can be overridden per-field.

| Key | Type | Description |
|-----|------|-------------|
| `title` | string | Form title (rendered in chrome) |
| `description` | string | Form description (markdown supported) |
| `class` | string | Extra class on the `<form>` element |
| `pattern` | string | Default regex pattern for text-like fields |
| `patternMessage` | string | Default message when pattern fails |
| `submit` | object | Submit endpoint defaults (see `submit` below) |
| `feedback` | object | Default validation copy |
| `validation` | object | Per-key default messages (legacy key, empty in current configs) |
| `required` | object | Required marker defaults |

### `settings.feedback`

```yaml
feedback:
  valid: "Виглядає добре!"           # Default valid hint
  invalid: "Будь ласка, перевірте"   # Default invalid hint
  pattern: "Неприпустимі символи"    # Default pattern failure
  email: "Невірний email"            # Default email format failure
  compare: "Значення не співпадають" # Default cross-field comparison failure
```

### `settings.required`

```yaml
required:
  marker: "*"                        # Required marker character
  tooltip: "Це поле обов'язкове"     # Tooltip on marker
  message: "Будь ласка, заповніть"   # Default required message
  class: "text-danger small"         # CSS class for marker
```

---

## `steps` — Wizard Steps

Array of step objects. Every submittable field must be reachable from here.

```yaml
steps:
  - id: "start"                     # Required. Step identifier [a-z][a-z0-9_]*
    title: "Початок"                # Optional. Step title (shown in chrome)
    class: "h4 text-primary"        # Optional. CSS class on step title
    rows: []                        # Required. Layout rows (min 1)
```

### `rows` — Layout Rows

Each row is either a **field row** (has `fields`) or a **column split** (has `cols`).

#### Field Row

```yaml
rows:
  - class: "row mb-3"               # Optional. CSS class (Bootstrap grid tokens)
    auto: false                     # Optional. Auto-distribute visible fields
    fields:                         # Required when not using cols
      - name: "email"               # Required. Field name (submission key)
        type: "email"               # Required. Field type (see Field Types)
        # ... field options
```

#### Column Split Row

```yaml
rows:
  - class: "row"
    cols:
      - class: "col-12 col-md-6"    # Required. Bootstrap column class
        rows:                       # Required. Nested rows inside this column
          - fields: [...]
```

**Auto rows** (`auto: true`): The renderer distributes visible fields evenly across breakpoints, ignoring each field's `col` setting.

---

## Field Types

All fields require `name` and `type`. Additional keys vary by type.

### Text-Like Fields

| Type | Description | Specific Keys |
|------|-------------|---------------|
| `text` | Single-line text | `placeholder`, `minlength`, `maxlength`, `pattern`, `spellcheck`, `autocomplete`, `autocapitalize`, `prepend`, `append` |
| `tel` | Telephone input | Same as `text` |
| `email` | Email input | Same as `text` |
| `number` | Numeric input | `min`, `max`, `step`, `placeholder`, `prepend`, `append` |
| `textarea` | Multi-line text | `rows` (default 4), `placeholder`, `minlength`, `maxlength`, `spellcheck` |

**Common keys for text-like:**
- `required`: `true` \| `false` \| conditional object
- `readonly`: `true` \| `false` \| conditional object
- `depends`: Visibility conditions (see Conditions)
- `label`: Label object or string
- `helper`: Help text below control
- `placeholder`: Placeholder text
- `feedback`: Per-field validation copy override
- `validation`: Per-field validation message defaults
- `col`: Bootstrap grid class (e.g., `col-12 col-md-6`)
- `class`: Extra CSS class on field wrapper
- `value`: Default value (string, number, boolean, object, array, null)

### Select Fields

| Type | Description | Specific Keys |
|------|-------------|---------------|
| `select` | Dropdown select | `options` (required), `placeholder`, `multiple`, `size` |
| `radio` | Radio button group | `options` (required) |
| `checkbox` | Single checkbox | — |
| `checkbox_group` | Multiple checkboxes as toggle buttons | `options` (required), `variant` (primary/secondary/success/danger/warning/info/light/dark) |

**Options format:**
```yaml
options:
  - value: "val1"
    label: "Label 1"
  - value: "val2"
    label: "Label 2"
```

### Composite Fields

| Type | Description | Specific Keys |
|------|-------------|---------------|
| `autocomplete` | Search + select combo | `data` (URL or array), `mode` (auto/search/select), `threshold`, `minChars`, `maxResults`, `datas` (for dependent sources) |
| `file` | File upload | `accept`, `multiple`, `file` (object: `minFiles`, `maxFiles`, `maxSize`, `infoLine`) |
| `widgets` | Built-in complex widgets | `widget` (required: `captcha` \| `location` \| `map` \| `price_info`), widget-specific config |

#### `widgets` — `captcha`

```yaml
- name: "captcha"
  type: "widgets"
  widget: "captcha"
  theme: "light"              # light | dark | auto
  size: "normal"              # normal | compact
  appearance: "always"        # always | execute | interaction-only
```

#### `widgets` — `location`

Cascading location selector (oblast → raion → hromada → settlement).

```yaml
- name: "location_widget"
  type: "widgets"
  widget: "location"
  data: "/assets/data/all.json"
  settings:
    method: "two"             # "one" | "two" (ancestor fill behavior)
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
      pattern: "^[А-Яа-яІіЇїЄєҐґ\\s\\-']+$"
    - name: "raion"
      parent: "oblast"
      children: "hromada"
      # ...
```

#### `widgets` — `map`

Leaflet map picker.

```yaml
- name: "map_widget"
  type: "widgets"
  widget: "map"
  height: 420                 # Optional. Desktop height (mobile 280px default)
```

#### `widgets` — `price_info`

Shows price per m², converted currencies.

```yaml
- name: "price_info_widget"
  type: "widgets"
  widget: "price_info"
  depends:
    - field: "surface"
      value: ">0"
    - field: "price"
      value: ">0"
```

### Content Types (Non-Input)

These render markup only, no form control.

| Type | Description | Specific Keys |
|------|-------------|---------------|
| `heading` | Heading element | `level` (1-6, default 2), `markdown` |
| `paragraph` | Paragraph | `markdown` |
| `list` | Unordered/ordered list | `tag` (ul/ol, default ul), `items` (array of strings or `{text, markdown}`), `markdown` |
| `alert` | Alert box | `variant` (primary/secondary/success/danger/warning/info/light/dark), `dismissible`, `markdown` |
| `badge` | Inline badge | `variant`, `pill` (rounded), `markdown` |
| `image` | Image figure | `src` (required), `alt`, `caption`, `markdown` |
| `raw` | Trusted HTML | `html` (required) |

### `hidden` Field

Hidden input, value usually set at runtime by page glue.

```yaml
- name: "uid"
  type: "hidden"
  value: ""                   # Runtime fills this
```

---

## Conditions (`depends`, `required`, `readonly`, etc.)

Conditions control visibility, required state, and conditional copy.

### Single Condition

```yaml
depends:
  - field: "action_type"      # Required. Field name to watch
    values: ["sell", "rent"]  # Equality: field value in this array
    # OR
    value: ">0"               # Comparison: >0, <10, >=5, <=100, ==val, !=val
    # OR
    except: ["land"]          # Negation: field value NOT in this array
    logic: "and"              # How to combine with siblings (and/or)
    text: "Custom copy"       # Per-condition label/help override
    when:                     # Gate: this condition only counts while nested holds
      field: "other_field"
      values: ["yes"]
```

### Condition List

A field can have multiple conditions (array) or a single condition (object). The default logic between siblings is `and`.

```yaml
# Multiple conditions (all must pass by default)
depends:
  - field: "action_type"
    values: ["sell"]
  - field: "property_type"
    except: ["land"]

# Conditional required
required:
  - field: "action_type"
    values: ["rent"]
```

### Conditional Text (Labels, Helpers, Messages)

Any `label`, `helper`, `placeholder`, or validation message can be conditional:

```yaml
label:
  text: "Default label"
  depends:
    - field: "property_type"
      values: ["room"]
      text: "Кількість місць"
  markdown: true
```

Or the shorthand (array of conditions, first match wins):

```yaml
label:
  - field: "property_type"
    values: ["room"]
    text: "Кількість місць"
  - text: "Default label"
```

---

## `submit` — Endpoint & Payload

```yaml
submit:
  action: "/api/submit"       # Required. Form action URL
  method: "POST"              # POST | PUT | PATCH (default: POST)
  endpoint: "/worker"         # Worker route (internal)
  captcha:
    widget: "turnstile"
    action: "submit"
    token: ""
    sitekey: "0x4AAAAAAA"
  success: "/thank-you"       # Redirect on success
  error: "/error"             # Redirect on error
  encoding: "json"            # json | multipart (auto when files present)
  response: "success"         # success | errors (how to read worker reply)
  errors:                     # Worker code → user message map
    "1001": "Це оголошення вже існує"
    "1002": "Перевірте телефон"
```

---

## `behavior` — Page vs Modal

```yaml
behavior:
  mode: "page"                # page | modal (default: page)
  modal: "#my-modal"          # CSS selector of modal element (modal mode)
  seed: "form-data-island"    # JSON island ID for hidden field seeds (modal)
  success:
    hide: "#my-modal"         # Element to hide on success
    show: "#success-toast"    # Element to show on success
  reset: true                 # Reset form after modal submit
```

---

## `chrome` — Wizard Copy Overrides

Site adapter supplies defaults; config overrides per form.

```yaml
chrome:
  previous: "Попереднє"
  next: "Наступне"
  submit: "Надіслати"
  sending: "Надсилаю"
  successTitle: "Оголошення надіслано"
  successText: "Дякуємо!"
  errorTitle: "Не вдалося надіслати"
  errorCode: "Код помилки"
  retry: "Спробувати ще раз"
  close: "Закрити"
```

---

## `rates` — Currency Rates

Used by `price_info` widget.

```yaml
rates:
  usd: 41.50
  eur: 45.20
  nbu: 41.30
```

---

## `captcha` — Turnstile Settings

```yaml
captcha:
  enabled: true
  sitekey: "0x4AAAAAAA"
  language: "uk"
  retryInterval: 5000
  maxRetries: 3
  localHosts:
    - "localhost"
    - "127.0.0.1"
```

---

## `assets` — Script/Style Paths

Override where the baked page finds its assets.

```yaml
assets:
  base: "/assets/js/form-engine/"
  script: "app.js"
  captchaScript: "https://challenges.cloudflare.com/turnstile/v0/api.js"
  style: "form-engine.css"
  leafletCss: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
  leafletJs: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
```

---

## Validation Rules (Per-Field)

Fields can have a `validation` object (same shape as `messages` in schema):

```yaml
validation:
  required: "Це поле обов'язкове"
  pattern: "Тільки цифри"
  min: "Мінімум {min}"
  max: "Максимум {max}"
  minlength: "Мінімум {min} символів"
  maxlength: "Максимум {max} символів"
  minFiles: "Мінімум {min} файлів"
  maxFiles: "Максимум {max} файлів"
  maxSize: "Файл не може бути більшим за {limit}"
  compare:
    - field: "confirm_email"
      operator: "=="
      message: "Email не співпадають"
```

---

## Cross-Field Comparison (`validation.compare`)

```yaml
validation:
  compare:
    - field: "surface_live"           # Single field
      operator: "<="
      message: "Житлова не може бути більше за загальну"
    - field: ["surface_live", "surface_kitchen"]  # Sum of fields
      operator: "<="
      message: "Сума частин не може перевищувати загальну"
```

Operators: `<`, `<=`, `>`, `>=`, `==`, `!=`

---

## Complete Example: Minimal Form

```yaml
version: 1
id: "contact"
theme: "tailwind"
settings:
  feedback:
    valid: "OK"
    invalid: "Перевірте"
  required:
    marker: "*"
steps:
  - id: "main"
    title: "Контакти"
    rows:
      - class: "row"
        fields:
          - name: "email"
            type: "email"
            required: true
            label: "Email"
            placeholder: "you@example.com"
            col: "col-12"
          - name: "message"
            type: "textarea"
            required: true
            label: "Повідомлення"
            placeholder: "Ваш текст..."
            col: "col-12"
            rows: 5
submit:
  action: "/api/contact"
  method: "POST"
```

---

## Complete Example: Multi-Step with Conditions

```yaml
version: 1
id: "property"
theme: "bootstrap4"
settings:
  title: "Додати нерухомість"
  feedback:
    valid: "Виглядає наче все добре!"
    invalid: "Будь ласка, заповніть це поле дійсними даними"
steps:
  - id: "type"
    title: "Тип об'єкта"
    rows:
      - fields:
          - name: "action_type"
            type: "select"
            required: true
            label: "Дія"
            placeholder: "Оберіть..."
            options:
              - value: "sell"
                label: "Продаю"
              - value: "rent"
                label: "Здаю в оренду"
          - name: "property_type"
            type: "select"
            required: true
            label: "Вид нерухомості"
            placeholder: "Оберіть..."
            options:
              - value: "apartment"
                label: "Квартира"
              - value: "house"
                label: "Будинок"
              - value: "land"
                label: "Земля"

  - id: "details"
    title: "Деталі"
    rows:
      - fields:
          - name: "surface"
            type: "number"
            required: true
            label: "Площа (м²)"
            min: 1
            col: "col-12 col-md-6"
            depends:
              - field: "property_type"
                except: ["land"]

      - name: "rooms"
        type: "number"
        required: true
        label: "Кімнат"
        min: 1
        max: 20
        col: "col-12 col-md-6"
        depends:
          - field: "property_type"
            except: ["land"]

submit:
  action: "/api/property"
  method: "POST"
```

---

## Schema Validation

Always validate before committing:

```sh
# Strict mode (fails on unknown keys)
node tools/validate-config.mjs _data/my-form.yml --strict

# Non-strict (allows unknown keys, useful for exploration)
node tools/validate-config.mjs _data/my-form.yml
```

The `--strict` flag ensures your config uses only keys the renderer understands. Unknown keys are reported but don't break the build in non-strict mode.