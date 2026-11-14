# Form Engine — Jekyll example

Мінімальний, самодостатній Jekyll-сайт з однією демонстраційною формою. Усе,
що потрібно для збірки, лежить у цій теці — жодних `../..` за її межі.

## Що всередині

```
_config.yml                     # site data: endpoint, rates, baseurl
_data/demo.yml                  # джерело правди: сама форма (version/id/settings/steps)
_data/uk.yml                    # українська chrome-копія (читає site-opts.mjs)
demo.html                       # {% include form/app/demo.html %}
index.html                      # лендінг
_layouts/default.html           # мінімальний HTML-каркас (Bootstrap 4)
_plugins/form_engine.rb         # bake-хук: під час збірки пече кожну форму
_form-engine/tools/             # gen-form-app / validate-config / site-opts / yaml
_form-engine/schema/            # копія схеми, яку перевіряє validate-config
assets/js/form-engine/          # копія runtime (entry: app.js)
_includes/form/app/             # сюди печеться demo.html (generated)
```

## Збірка

```sh
bundle install
bundle exec jekyll serve      # http://127.0.0.1:4000/demo.html
```

`jekyll build` викликає `_plugins/form_engine.rb`, який на кожній збірці:

1. перевіряє `_data/demo.yml` через `_form-engine/tools/validate-config.mjs`;
2. пече фрагмент `_includes/form/app/demo.html`.

Запечений фрагмент — generated-файл (у `.gitignore`): його не редагують руками.

## Локальна перевірка без Ruby

```sh
node _form-engine/tools/validate-config.mjs _data/demo.yml --strict
node _form-engine/tools/gen-form-app.mjs --name demo \
  --data _data/demo.yml --out _includes/form/app/demo.html
```

Потрібен лише Node ≥ 20 **і** пакет `js-yaml` (його імпортує
`_form-engine/tools/yaml.mjs`). У репозиторії пакета `js-yaml` уже стоїть у
`node_modules`, тож команди вище працюють з кореня пакета; якщо копіювати цю
теку окремим сайтом — спершу `npm install js-yaml`.

## Як зробити свою форму

1. Додайте `_data/<name>.yml` (скопіюйте `demo.yml` як шаблон).
2. Додайте сторінку з одним рядком `{% include form/app/<name>.html %}`.
3. `bundle exec jekyll serve` — форму запече й покаже автоматично.

Endpoint форми резолвиться як `config.submit.action`, інакше
`<name>_endpoint` з `_config.yml`.
