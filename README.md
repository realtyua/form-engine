# Form Engine

> Declarative form engine with Jekyll and Eleventy adapters.

## Status

This repository is in early development. The initial bootstrap (PUB-1) has been completed.

## Structure

```
form-engine/
├── runtime/              # Core runtime (framework-agnostic)
│   └── themes/           # Theme implementations (Bootstrap 4, Tailwind)
├── adapters/
│   ├── jekyll/           # Jekyll adapter (_plugins, tools)
│   └── eleventy/         # Eleventy/11ty adapter (lib)
├── tools/                # CLI tools (validator, bake, gates)
├── schema/               # JSON Schema for form configs
├── test/                 # Test suite (node --test)
├── examples/
│   ├── jekyll/           # Jekyll example site
│   └── eleventy/         # Eleventy example site
├── LICENSE               # MIT License
├── NOTICE                # Attribution notices
└── package.json          # Package manifest (private: true)
```

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).