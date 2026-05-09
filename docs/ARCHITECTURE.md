# Architecture

## Goals

1. **Token efficiency for AI agents.** A template input should be 5-10× smaller than the equivalent hand-written HTML.
2. **Single-file output.** Everything inlined: CSS, JS, SVG. No CDNs, no external dependencies. Works offline, emails as an attachment.
3. **CPU-only rendering.** No LLM calls during render. The agent's job ends when it emits the data; htmd does the rest.
4. **Extensible.** External npm packages can ship templates.

## Stack

- **Node 20+, ESM only** (`"type": "module"`).
- **`commander`** for CLI.
- **`marked`** for Markdown→HTML in template bodies.
- **`turndown`** for HTML→Markdown (the inverse, for input compression).
- **`ajv`** + JSON Schema for input validation.
- **`yaml`** for input parsing (JSON works too — it's a YAML subset).
- Inline-SVG charts implemented directly (no chart deps) — see `src/chart.js`.

## Why JS modules instead of Mustache/Handlebars

Templates are real ESM modules that export a `render(data, helpers) => string` function. Reasons:

- **Auto-escaping by default** via the `html\`...\`` tagged template literal. No `{{{ triple-stash }}}` foot-guns.
- **Real expressions** for non-trivial logic (computing weighted totals in `decision-matrix`, normalizing chart data, etc.). Mustache forces you into helpers; JS lets you just write code.
- **Editor support** — syntax highlighting, types via JSDoc, LSP go-to-definition all work.
- **No DSL to learn.** Anyone who knows JS can write or read a template.

Trade-off: templates are arbitrary code, so plugin authors need to be trustworthy (same as any npm dep).

## Render flow

```
data (YAML/JSON) ─┐
                  │
template name ────┼─→ load template ─→ validate against schema ─→ render(data, helpers) ─→ wrapShell ─→ HTML
                  │       │                       │                       │                   │
                  │   schema.json             ajv                  html\`\` tagged literal     inline tokens.css + reset.css + style.css + (script.js)
                  │   render.js
                  │   style.css
                  │   script.js?
                  │
                  └─→ from templates/ (built-in) or node_modules/htmd-template-* (plugins)
```

## The `html\`...\`` tagged template

`src/html-tag.js` defines `html`, `raw`, `escapeHtml`, `cls`. Behaviour:

- Interpolated values are HTML-escaped by default.
- `raw(s)` marks a string as already-safe (no escaping).
- Arrays are flattened.
- `false` and `null` interpolate as empty string.

This means a template like:

```js
html\`<h1>\${data.title}</h1>\${data.items.map(i => html\`<li>\${i.name}</li>\`)}\`
```

Just works, with `data.title` and `i.name` escaped automatically, and the array of `<li>` elements flattened in.

## Schema validation

Each template ships a `schema.json` (JSON Schema draft-07). On render:

1. ajv compiles the schema (cached after first compile).
2. Data is validated.
3. Failures throw with `code: 'HTMD_SCHEMA_INVALID'` and an `errors` array naming the offending field, so agents/users can fix and retry.

Validation can be skipped with `--no-validate` (or `{ validate: false }` in the API), but it's the default.

## Charts

`src/chart.js` (~250 LOC) generates inline SVG for sparkline, bar, line, donut. No external chart library — keeps the bundle tiny and avoids version churn. SVG colors come from CSS custom properties so themes can override.

## Theming (foundation)

`templates/_base/tokens.css` defines design tokens as CSS custom properties: `--htmd-accent`, `--htmd-bg`, `--htmd-success`, etc. Each template's CSS uses these vars exclusively. A theme system (planned) would just override the tokens.

Dark/light mode works today via `prefers-color-scheme`.

## Plugin SDK

A template plugin is an npm package named `htmd-template-<name>` with `htmd-template` in its `keywords`. htmd scans `node_modules/` at startup and auto-registers them.

Layout of a plugin package:

```
htmd-template-foo/
├── package.json    # keywords: ["htmd-template"]
├── render.js
├── schema.json
├── style.css
├── script.js (optional)
├── description.md
└── example.yaml
```

The plugin's `render.js` should `import` from `htmd` for shared helpers if needed.

## Why no React / no Lit / no JSX

- Adds a build step (we ship `render.js` files directly).
- Bigger output (React's runtime alone is 40+ KB).
- Harder for non-frontend folks to read.
- We only need string output. Tagged template literals are the simplest tool that does the job.
