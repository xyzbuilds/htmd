# Authoring an htmd template

A template is a directory with five files (six if it's interactive):

```
my-template/
├── render.js          required — exports default render function
├── schema.json        required — JSON Schema for input
├── style.css          required — uses CSS custom props from _base/tokens.css
├── description.md     required — one-line summary for agents (first non-heading line)
├── example.yaml       required — sample input that demonstrates the template
└── script.js          optional — only for Tier B interactive templates
```

Scaffold one with `htmd init-template <name>`.

## render.js

```js
import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  return html\`
    <main class="my">
      <h1>\${data.title}</h1>
      <p>\${data.body}</p>
    </main>
  \`;
}
```

The default export is `function render(data, helpers) → string` (or an object from the `html\`\`` tag — the renderer flattens it).

### Helpers (`h`)

| Helper | Purpose |
|---|---|
| `h.html` | The tagged template literal — same as `import { html }`. |
| `h.raw(s)` | Mark a string as pre-escaped (skip auto-escape). Use with care. |
| `h.escapeHtml(s)` | Manual HTML escape. |
| `h.md(mdText)` | Render Markdown to HTML inline (returns a `raw()` value, safe to interpolate). |
| `h.mdToHtml(s)` | Same as above but returns a string. |
| `h.chart.sparkline(values, opts)` | Inline SVG sparkline. |
| `h.chart.bar(items, opts)` | Horizontal bar chart. |
| `h.chart.line(series, opts)` | Line chart with axes. |
| `h.chart.donut(slices, opts)` | Donut chart with optional center label. |
| `h.fmt.number(v)`, `.currency(v, code)`, `.percent(v, digits)`, `.delta(v)`, `.date(v)` | Locale-aware formatters. |

## schema.json

Standard JSON Schema (draft-07). The `title` of the schema should be the template name. Use `required` on must-have fields. Use `additionalProperties: false` if you want strict validation.

Errors are surfaced to the caller naming the bad field, so make required-field errors helpful.

## style.css

Use the design tokens from `_base/tokens.css` exclusively for colors:

```css
.my {
  background: var(--htmd-surface);
  color: var(--htmd-fg);
  border: 1px solid var(--htmd-border);
  border-radius: var(--htmd-radius);
  padding: 1rem;
}
.my-accent { color: var(--htmd-accent); }
```

The tokens you can rely on:

- Surfaces: `--htmd-bg`, `--htmd-surface`, `--htmd-surface-2`, `--htmd-border`
- Text: `--htmd-fg`, `--htmd-fg-muted`, `--htmd-muted`
- Brand: `--htmd-accent`, `--htmd-accent-soft`, `--htmd-accent-fg`
- Semantic: `--htmd-success(-soft)`, `--htmd-warn(-soft)`, `--htmd-danger(-soft)`, `--htmd-info(-soft)`
- Shape: `--htmd-radius`, `--htmd-radius-sm`, `--htmd-shadow`, `--htmd-shadow-lg`
- Type: `--htmd-font-sans`, `--htmd-font-mono`, `--htmd-text-xs`..`--htmd-text-3xl`

Dark mode is handled automatically via `prefers-color-scheme` overrides in `tokens.css`.

For print styles, prefix with `@media print { ... }` and use `print-color-adjust: exact` for any colored backgrounds you want preserved.

## script.js (Tier B only)

If your template is interactive, ship a `script.js` that runs on DOMContentLoaded.

Best practices:

- **Embed initial state in JSON:**
  ```js
  // in render.js
  html\`<script type="application/json" data-my-state>\${JSON.stringify(state)}</script>\`
  // in script.js
  const state = JSON.parse(document.querySelector('[data-my-state]').textContent);
  ```
- **Use `data-*` attributes for queries.** Don't rely on classnames that style.css also uses.
- **No external dependencies.** The script is inlined in a single file — bundling is up to you.
- **Wrap everything in an IIFE** to avoid polluting global scope.

## description.md

Markdown. The first non-heading line is used as the short description in `htmd templates` listings. Keep it actionable for agents — describe **when to use** this template.

## example.yaml

A realistic sample that exercises every feature of the template. This is what gets rendered to `examples/<name>.html` for the gallery. Make it look great.

## Publishing as a plugin

```bash
mkdir htmd-template-foo
cd htmd-template-foo
# add the template files (render.js, schema.json, style.css, etc.)
```

`package.json`:
```json
{
  "name": "htmd-template-foo",
  "version": "0.1.0",
  "type": "module",
  "keywords": ["htmd-template"],
  "files": ["render.js", "schema.json", "style.css", "script.js", "description.md", "example.yaml"],
  "peerDependencies": { "htmd": "^0.1.0" }
}
```

Then publish: `npm publish`. Anyone who `npm install htmd-template-foo` will see `foo` in their `htmd templates` list.
