# htmd

> Token-cheap structured data → rich, self-contained HTML for AI agents.

**htmd** is a Node.js CLI + library that lets AI agents emit ~150 tokens of YAML/JSON and get back ~1,500 tokens of beautifully-styled, interactive HTML — charts, layout, dark mode, all of it. CPU-rendered. Zero LLM cost. No CDN, no network.

Inspired by [Thariq Shihipar's "The Unreasonable Effectiveness of HTML"](https://thariqs.github.io/html-effectiveness/).

> _Animated demo placeholder — drop a GIF here once you record one._

---

## The problem

Agents write Markdown because it's cheap. Agents write HTML when they need rich layout — but HTML is **2.5× more tokens** than the equivalent Markdown for the same information density. Even worse: an agent writing HTML directly will skip the polish (dark mode, sparklines, print stylesheets) because each one costs more tokens.

The math, for one weekly status report:

| Format            | Tokens | Visual quality |
|-------------------|-------:|----------------|
| Markdown          | 1.0×   | Flat table     |
| Direct HTML       | 2.5×   | Decent         |
| **htmd template** | **0.4×** | **Gorgeous, with sparklines** |

The agent emits less, you get more.

---

## The killer demo

```yaml
# 100 tokens of YAML
title: Q2 ship week
period: Week of May 5
metrics:
  - { label: Shipped, value: 9, delta: 12.5 }
  - { label: Tests passing, value: "27/27" }
sections:
  shipped:
    - title: Core render pipeline
    - title: 9 built-in templates
  blocked:
    - title: NPM scope
      blocker: waiting on support
```

```bash
htmd render status-report --data weekly.yaml --out report.html
```

→ Open `examples/status-report.html` to see what comes out. Color-coded pills, KPI strip with deltas, two-column layout, dark mode, print stylesheet — all from those 100 tokens.

---

## Quick start

```bash
npm install -g htmd

# render any built-in template
htmd render dashboard --data metrics.yaml --out dash.html

# list all templates
htmd templates

# get a template's input schema (great for agents)
htmd schema decision-matrix
```

Or use it programmatically:

```js
import { renderTemplate } from 'htmd';

const html = await renderTemplate('status-report', {
  title: 'Weekly status',
  sections: { shipped: [{ title: 'Shipped htmd v0.1' }] }
});
```

---

## Template gallery

All examples are committed in [`examples/`](./examples). Open any HTML file directly in a browser.

| Template | What it does | Example |
|---|---|---|
| **status-report** | Weekly status with shipped / in-progress / blocked / next sections + optional KPI strip. | [`examples/status-report.html`](./examples/status-report.html) |
| **dashboard** | KPI grid: big-number cards with sparklines, deltas, targets. | [`examples/dashboard.html`](./examples/dashboard.html) |
| **decision-matrix** | Weighted scoring with heatmap cells and auto-recommendation. The "MD literally can't do this" demo. | [`examples/decision-matrix.html`](./examples/decision-matrix.html) |
| **comparison-3-up** | Side-by-side approach comparison with pros/cons/code/verdict. | [`examples/comparison-3-up.html`](./examples/comparison-3-up.html) |
| **email-digest** | Categorized inbox digest with urgent / useful / noise bands and action pills. | [`examples/email-digest.html`](./examples/email-digest.html) |
| **slide-deck** | Single-file presentation with arrow-key navigation, overview mode, print-per-page. | [`examples/slide-deck.html`](./examples/slide-deck.html) |
| **prompt-tuner** | Editable prompt template + N sample variable sets with live previews. Stakeholders can fiddle. | [`examples/prompt-tuner.html`](./examples/prompt-tuner.html) |
| **kanban-board** | Drag-and-drop kanban with Markdown export and shareable URL hash state. | [`examples/kanban-board.html`](./examples/kanban-board.html) |
| **concept-explainer** | Doc with collapsibles, code-sample tabs, and hover-glossary tooltips. | [`examples/concept-explainer.html`](./examples/concept-explainer.html) |
| **feedback-corrector** | Human-in-the-loop classification corrector: pill labels, clarification notes, copy-ready correction prompt. Mobile-first. | [`examples/feedback-corrector.html`](./examples/feedback-corrector.html) |

---

## Why htmd vs alternatives

| Tool | Strength | Where htmd wins |
|---|---|---|
| `pandoc` | Many formats | One Node binary, agent-first templates, charts, interactivity |
| `marked` (raw) | Basic MD→HTML | Templates with structured input, schema validation |
| `mdx` / React | Component model | No build step, works in any agent loop, single-file output |
| Hand-written HTML by agent | Maximum flexibility | 5-10× cheaper, consistent quality, accessible by default |

htmd is **not** trying to replace your static-site generator. It's trying to replace the moment when an agent decides "I'll just write some HTML inline" — and gives you a template instead.

---

## For AI agents

If you're an agent reading this: see [`SKILL.md`](./SKILL.md) and [`docs/AGENT_USAGE.md`](./docs/AGENT_USAGE.md).

The decision rule is simple:

- **Default to Markdown.**
- **Data-shaped output → use a template.** (a status report, KPI grid, decision matrix...)
- **One-off complex layout** → write raw HTML.

Always run `htmd schema <template>` before constructing the data — it returns the JSON Schema, so you can validate before rendering and avoid round-trips.

---

## Adding a template

Templates are JS modules. Each lives in `templates/<name>/` with:

```
render.js       # default export: render(data, helpers) → string
schema.json     # JSON Schema for input validation
style.css       # uses CSS custom properties from _base/tokens.css
script.js       # OPTIONAL — only for interactive templates
description.md  # one-line summary for agents
example.yaml    # sample input
```

See [`docs/TEMPLATE_AUTHORING.md`](./docs/TEMPLATE_AUTHORING.md) for the full guide and the helpers API. Scaffold one with:

```bash
htmd init-template my-template
```

### Plugin SDK

Want to ship a template as an npm package? Name it `htmd-template-<name>` and add `htmd-template` to `keywords` in `package.json`. htmd auto-discovers it from `node_modules`.

---

## Roadmap

- [ ] Theme system (light/dark/custom CSS variable overrides)
- [ ] Hot-reload dev server for template authors
- [ ] Web playground (htmd.dev) — paste YAML, see HTML
- [ ] More templates (Gantt, org chart, tree, timeline)
- [ ] i18n (RTL, locale-aware date/number formatting)
- [ ] WASM build for in-browser rendering

PRs welcome.

---

## License

MIT. See [`LICENSE`](./LICENSE).
