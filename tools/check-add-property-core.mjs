// Shared gate logic for the three check-add-property wrappers.
//
// The wrappers only resolve paths, load the config/baseline and render the
// form; every expectation lives here. Expectations are derived from the config
// (type: autocomplete, type: widgets + widget: location), never from a field
// name, so renaming a field cannot silently weaken or break the gate (MOD-14).

const CONTENT_TYPES = new Set(['alert', 'badge', 'heading', 'image', 'list', 'paragraph', 'raw']);

export function eachField(rows, visit) {
  for (const row of rows || []) {
    for (const field of row.fields || []) visit(field, row);
    for (const col of row.cols || []) eachField(col.rows, visit);
  }
}

export function everyField(config, visit) {
  for (const step of config.steps || []) eachField(step.rows, visit);
}

export function extractFormSlice(src) {
  const start = src.indexOf(`<form id="add-property-form"`);
  if (start < 0) throw new Error('baseline has no <form id="add-property-form">');
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src.startsWith('<form', i)) { depth++; i += 4; }
    else if (src.startsWith('</form>', i)) {
      depth--;
      if (depth === 0) return src.slice(start, i);
      i += 6;
    }
  }
  throw new Error('baseline form is unbalanced');
}

// The attributes each implementation owns. The old page is bound with Alpine;
// the engine adds data-* hooks and a static `hidden` where the partial used an
// x-show default. Strip those, and the inline feedback display the engine
// deliberately leaves to Bootstrap.
const ALPINE_ATTR = /\s(x-[a-z][\w.:-]*|@[a-z][\w.:-]*|:[a-z-]+)="[^"]*"/g;
const DATA_ATTR = /\sdata-[a-z][\w-]*="[^"]*"/g;

export function normalize(src, { alpine, dataAttr }) {
  return src
    .replace(/<template[\s\S]*?<\/template>/g, '')
    .replace(/ style="display: block"/g, '')
    .replace(alpine ? ALPINE_ATTR : '', (m) => (alpine ? m : m))
    .replace(dataAttr ? DATA_ATTR : '', (m) => (dataAttr ? m : m))
    .replace(/\sx-cloak\b/g, '')
    .replace(/\b hidden\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

export function collectIds(html) {
  const out = new Set();
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) out.add(m[1]);
  return out;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Static text a faithful render must keep, read from the config.
export function expectedStrings(config, inlineMarkdown) {
  const seen = new Set();
  const push = (v) => { if (v !== undefined && v !== null && v !== '') seen.add(String(v)); };
  const labelText = (label) => {
    if (typeof label === 'string') return push(label);
    if (label && typeof label === 'object' && typeof label.text === 'string' && !label.depends) {
      push(label.markdown ? inlineMarkdown(label.text) : label.text);
    }
  };

  const settings = config.settings || {};
  // title/description live in the page shell outside <form>; only the feedback
  // copy belongs to the fields.
  push(settings.feedback?.valid);

  everyField(config, (field) => {
    labelText(field.label);
    // the number partial never renders a placeholder, so those are runtime-only
    push(field.type === 'number' ? undefined : field.placeholder);
    push(field.helper);
    push(field.feedback?.valid);
    if (field.type === 'select' || field.type === 'radio' || field.type === 'checkbox_group') {
      for (const option of field.options || []) {
        const value = option.value ?? option;
        push(option.label ?? value);
      }
    }
    if (field.type === 'file' && field.file) {
      const fm = field.file;
      const min = fm.minFiles;
      const max = fm.maxFiles || 10;
      const limit = fm.maxSize || '5 MB';
      push((fm.infoLine || (min
        ? `фотознімки: від ${min} до ${max} файлів, до ${limit}`
        : `фотознімки: максимум ${max} файлів, до ${limit}`))
        .replace('{min}', min).replace('{max}', max).replace('{limit}', limit));
    }
    if (field.widget === 'location') {
      for (const sub of field.fields || []) {
        labelText(sub.label);
        push(sub.placeholder);
        push(sub.helper);
        push(sub.feedback?.valid);
      }
    } else if (field.widget) {
      push(field.theme);
      push(field.size);
      push(field.appearance);
    }
  });

  return [...seen];
}

// Reviewed copy edits between the frozen baseline and the config (JEK-R3).
// The config is the source of truth: after the baseline was captured, the
// Ukrainian copy gained typographic apostrophes, quotes around the two
// "Пошук" buttons, and one typo fix ("однму" -> "одному"). Each pair was
// triaged by hand; nothing else is accepted. A new or reworded string still
// fails the copy check unless the baseline contains it verbatim.
//   [ baseline text, accepted config text ]
const ACCEPTED_COPY_EDITS = [
  // 1. alert label - quotes around the "Пошук" buttons
  ['Перш ніж додати оголошення перевірте можлво це оголошення вже присутнє у нашому каталозі. Натисність зелену кнопку <b>Пошук</b> у верхній частині сторінки і виберіть опцію <b>Пошук в оголошеннях</b>.',
    'Перш ніж додати оголошення перевірте можлво це оголошення вже присутнє у нашому каталозі. Натисність зелену кнопку «<b>Пошук</b>» у верхній частині сторінки і виберіть опцію «<b>Пошук в оголошеннях</b>».'],
  // 2. communications label - apostrophe
  ["Комунікації в об'єкті нерухомості",
    'Комунікації в об’єкті нерухомості'],
  // 3. sell_with label - apostrophe
  ["Продаються разом з об'єктом нерухомості",
    'Продаються разом з об’єктом нерухомості'],
  // 4. rent_with label - apostrophe
  ["Передається в оренду разом з об'єктом нерухомості",
    'Передається в оренду разом з об’єктом нерухомості'],
  // 5. location widget helper - apostrophe
  ["Це допоможе легко знайти населений пункт де знаходиться об'єкт нерухомості",
    'Це допоможе легко знайти населений пункт де знаходиться об’єкт нерухомості'],
  // 6. autocomplete helper - apostrophe
  ["Введіть перші три українські літери у назві мікрорайону міста і виберіть ваш мікрорайон. Довідома, ці мікрорайони не є офіційним аміністративним поділом міста, то ж це поле не є обов'язковим",
    'Введіть перші три українські літери у назві мікрорайону міста і виберіть ваш мікрорайон. Довідома, ці мікрорайони не є офіційним аміністративним поділом міста, то ж це поле не є обов’язковим'],
  // 7. house_section_address option - apostrophe
  ["під'їзд", 'під’їзд'],
  // 8. map widget helper - apostrophe
  ["Ця мапа допоможе вам точно вказати де знаходиться ваша нерухомість. Рухаючи мапу вверх, вниз, вліво, вправо, збільшуючи, зменшуючи, знайдіть свою вулицю, будинок та покладіть паркер у тому місці і мапа визначить де це і точне розташування об'єкта на мапі.",
    'Ця мапа допоможе вам точно вказати де знаходиться ваша нерухомість. Рухаючи мапу вверх, вниз, вліво, вправо, збільшуючи, зменшуючи, знайдіть свою вулицю, будинок та покладіть паркер у тому місці і мапа визначить де це і точне розташування об’єкта на мапі.'],
  // 9. first_name label - apostrophe
  ["Ім'я", 'Ім’я'],
  // 10. images label - apostrophe
  ["Фотознимки об'єкта нерухомості", 'Фотознимки об’єкта нерухомості'],
  // 11. images helper - apostrophe
  ["Додайте максимум чотири широкоформатних фото не більше 5-ти мегабайт, до прикладу: загальне фото об'єкту нерухомості, вітальні чи спальні, кухні та кімнати особистої гігієни. Приклад доброго та поганого фото.",
    'Додайте максимум чотири широкоформатних фото не більше 5-ти мегабайт, до прикладу: загальне фото об’єкту нерухомості, вітальні чи спальні, кухні та кімнати особистої гігієни. Приклад доброго та поганого фото.'],
  // 12. images file info line - apostrophe + typo fix ("однму" -> "одному")
  ["Ви можете додати фотознімки об'єкта нерухомості: від 1 до 4 файлів, до 150KB в однму файлі",
    'Ви можете додати фотознімки об’єкта нерухомості: від 1 до 4 файлів, до 150KB в одному файлі'],
  // 13. captcha helper - apostrophe
  ["Якщо перевірка не з'явилася, натисніть «Спробувати ще раз».",
    'Якщо перевірка не з’явилася, натисніть «Спробувати ще раз».'],
];

const acceptedCopy = new Map(ACCEPTED_COPY_EDITS.map(([oldText, newText]) => [newText, oldText]));

export function copyChecks(config, html, baselineSlice, inlineMarkdown) {
  const checks = [];
  const check = (ok, label) => checks.push({ ok: Boolean(ok), label });

  // A copy string passes when the frozen baseline rendered it verbatim, or when
  // it is the accepted config side of a reviewed JEK-R3 copy edit.
  const copyInBaseline = (text) => {
    if (baselineSlice.includes(text)) return true;
    const oldText = acceptedCopy.get(text);
    return oldText !== undefined && baselineSlice.includes(oldText);
  };
  const engineNorm = normalize(html, { alpine: false, dataAttr: true });

  for (const text of expectedStrings(config, inlineMarkdown)) {
    check(copyInBaseline(text), `copy in baseline: ${text.slice(0, 60)}`);
    check(engineNorm.includes(text), `copy in render: ${text.slice(0, 60)}`);
  }

  const orphan = [...collectIds(html)].filter((id) => !collectIds(baselineSlice).has(id));
  check(orphan.length === 0, `engine ids all existed in the old page${orphan.length ? `: ${orphan.join(', ')}` : ''}`);
  return checks;
}

export function structureChecks(config, html) {
  const checks = [];
  const check = (ok, label) => checks.push({ ok: Boolean(ok), label });

  check(/<form id="add-property-form" method="POST" novalidate autocomplete="off" data-form="add-property">/.test(html), 'form wrapper');

  const plain = [];
  everyField(config, (field) => { if (field.name) plain.push(field); });

  for (const field of plain) {
    if (CONTENT_TYPES.has(field.type)) continue;
    check(html.includes(`"${field.name}"`), `field hook present: ${field.name}`);
    // Widgets render their own shells instead of a data-field-col wrapper.
    if (field.type === 'widgets') continue;
    check(
      new RegExp(`<div class="[^"]*\\bcol[^"]*"[^>]*data-field-col="${escapeRegExp(field.name)}">`).test(html),
      `field column: ${field.name}`,
    );
  }

  // Autocomplete contract: every expectation comes from the field definition.
  const autocompletes = plain.filter((field) => field.type === 'autocomplete');
  check(autocompletes.length > 0, 'autocomplete fields discovered from config');
  for (const field of autocompletes) {
    const name = field.name;
    const id = escapeRegExp(name);
    check(html.includes(`data-field="${name}"`), `autocomplete main control: ${name}`);
    check(
      new RegExp(`<select class="form-control" id="field_${id}"[^>]*data-field="${id}">`).test(html),
      `autocomplete select: ${name}`,
    );
    if (field.placeholder) {
      check(html.includes(`<option value="">${field.placeholder}</option>`), `autocomplete placeholder option: ${name}`);
    }
    for (const hook of ['search', 'dropdown', 'clear', 'noresults']) {
      check(html.includes(`data-autocomplete-${hook}="${name}"`), `autocomplete ${hook} hook: ${name}`);
    }
  }

  check(/class="custom-file-input" id="field_images" name="images" data-field="images" required/.test(html), 'file input attrs');
  check(/accept="image\/\*" multiple/.test(html), 'file accept and multiple');
  check(/class="file-previews mt-2"/.test(html), 'file previews container');

  // JEK-R4: `.file-info` was an Alpine-only slot in the old page
  // (`x-text="fileInfo(name)"`). The engine keeps the static limits line in
  // <small> and per-file details in .file-previews; it deliberately emits no
  // .file-info node (see test/render*.test.mjs). Keep the absence explicit so a
  // re-added dead slot fails the gate.
  check(!/class="file-info"/.test(html), 'no Alpine-only file-info slot');

  check(/<div class="col-12" data-widget="captcha" data-widget-name="captcha">/.test(html), 'captcha widget column');
  check(/<div class="mb-2" id="label_captcha">/.test(html), 'captcha label block');
  check(/<div id="captcha-widget" class="captcha-widget-box" tabindex="-1" data-captcha-field="captcha" data-captcha-theme="light" data-captcha-size="normal" data-captcha-appearance="always"><\/div>/.test(html), 'captcha turnstile box');
  check(/data-captcha-retry="captcha">Спробувати ще раз/.test(html), 'captcha retry button');
  check(/<span data-error="captcha"><\/span>/.test(html), 'captcha error hook');

  check(/<div class="mb-2" id="label_map_widget">/.test(html), 'map label block');
  check(/<div id="map-picker" class="border rounded map-picker-responsive" role="application" aria-labelledby="label_map_widget"><\/div>/.test(html), 'map picker');
  check(/\.map-picker-responsive \{ height: 280px; \}/.test(html), 'map partial CSS');
  check(/data-map-coords="map_widget"/.test(html), 'map coords hook');

  check(/data-widget="price_info" data-widget-name="price_info_widget"/.test(html), 'price_info widget');
  check(/<div class="card bg-light mb-3">/.test(html), 'price_info card');
  check(/data-price-info="price_info_widget"/.test(html), 'price_info hook');
  check(/data-depends="[^"]*"[^>]*data-widget="price_info" data-widget-name="price_info_widget"/.test(html), 'price_info depends wrapper');

  // Location contract: root name and every subfield name come from the config.
  const locations = plain.filter((field) => field.type === 'widgets' && field.widget === 'location');
  check(locations.length > 0, 'location widgets discovered from config');
  for (const field of locations) {
    const root = field.name;
    check(/<h6 class="card-title">/.test(html), 'location widget card title');
    for (const sub of field.fields || []) {
      const subName = sub.name;
      const subId = escapeRegExp(subName);
      check(
        new RegExp(`<select class="form-control" id="field_${escapeRegExp(root)}_${subId}" name="${escapeRegExp(root)}\\.${subId}"`).test(html),
        `location select name: ${root}.${subName}`,
      );
      check(html.includes(`id="field_${root}_${subName}_search"`), `location search id: ${root}.${subName}`);
      if (sub.placeholder) {
        check(html.includes(`<option value="">${sub.placeholder}</option>`), `location placeholder: ${root}.${subName}`);
      }
      if (sub.helper) {
        check(html.includes(`<small id="helper_${root}_${subName}" class="form-text text-muted">${sub.helper}</small>`), `location subfield helper: ${root}.${subName}`);
      }
      check(html.includes(`data-location-field="${subName}" data-location-root="${root}"`), `location field hooks: ${root}.${subName}`);
      check(html.includes(`data-location-search="${subName}" data-location-root="${root}"`), `location search hook: ${root}.${subName}`);
    }
    const leaf = (field.fields || []).at(-1)?.name;
    if (leaf) check(html.includes(`data-location-summary="${leaf}"`), `location summary: ${root}.${leaf}`);
  }

  check(!/\b(x-[a-z]+|@[a-z][\w.:-]*|:[a-z-]+)=/.test(html), 'no Alpine in engine output');

  const engineIds = collectIds(html);
  for (const field of plain) {
    if (CONTENT_TYPES.has(field.type)) continue;
    if (field.type === 'widgets' && field.widget === 'price_info') continue;
    if (field.type === 'widgets' && field.widget === 'location') {
      for (const sub of field.fields || []) {
        check(engineIds.has(`field_${field.name}_${sub.name}`), `location id field_${field.name}_${sub.name}`);
        check(engineIds.has(`field_${field.name}_${sub.name}_search`), `search id field_${field.name}_${sub.name}_search`);
      }
      check(/<h6 class="card-title">/.test(html), 'location card title id');
    } else if (field.type === 'widgets') {
      check(engineIds.has(`label_${field.name}`), `widget label id ${field.name}`);
    } else if (field.type === 'checkbox_group') {
      check(html.includes(`data-toggle-for="${field.name}"`), `checkbox_group hook ${field.name}`);
    } else if (field.type === 'radio') {
      // radios carry per-option ids, not a field id
      for (const option of field.options || []) {
        const value = option.value ?? option;
        check(engineIds.has(`field_${field.name}_${value}`), `radio id field_${field.name}_${value}`);
      }
    } else {
      check(engineIds.has(`field_${field.name}`), `control id field_${field.name}`);
    }
  }
  check(engineIds.has('map-picker') && engineIds.has('captcha-widget'), 'widget fixed ids in render');

  return checks;
}

export function runCheckAddProperty({ config, html, baselineSlice, inlineMarkdown }) {
  return [
    ...copyChecks(config, html, baselineSlice, inlineMarkdown),
    ...structureChecks(config, html),
  ];
}
