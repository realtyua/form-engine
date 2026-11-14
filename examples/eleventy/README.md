# Form Engine — Eleventy example

Мінімальний, самодостатній 11ty-сайт з однією демонстраційною формою. Усе,
що потрібно для збірки, лежить у цій теці — жодних `../..` за її межі.

## Що всередині

```
.eleventy.js                    # passthrough-copy runtime + registerForms()
lib/form-engine.js              # адаптер: пече форми, реєструє {% formApp %}
src/_data/demo.yml              # джерело правди: сама форма (version/id/settings/steps)
src/_data/site.js               # site data: demoEndpoint
src/_includes/layouts/default.njk
src/index.njk                   # лендінг
src/demo.njk                    # {% formApp "demo" %}
src/assets/js/form-engine/      # копія runtime (entry: app.js)
```

## Збірка

```sh
npm install
npx @11ty/eleventy             # -> dist/
npx @11ty/eleventy --serve     # http://localhost:8080/demo/
```

Під час збірки `lib/form-engine.js` на хуку `beforeBuild` пече кожен
`src/_data/<name>.yml` і реєструє шорткод `{% formApp "<name>" %}`. Фрагмент
ніколи не переписується Nunjucks-ом — саме тому тут шорткод, а не include.

## Перевірка конфіга

Схема живе в пакеті, тож перевірка — з кореня пакета:

```sh
node tools/validate-config.mjs examples/eleventy/src/_data/demo.yml --strict
```

## Як зробити свою форму

1. Додайте `src/_data/<name>.yml` (скопіюйте `demo.yml` як шаблон).
2. Додайте сторінку з `{% formApp "<name>" %}`.
3. `npx @11ty/eleventy --serve` — форму запече й покаже автоматично.

Endpoint форми резолвиться як `config.submit.action`, інакше через мапу в
`lib/form-engine.js` (`ENDPOINTS`), яка читає `src/_data/site.js`.
