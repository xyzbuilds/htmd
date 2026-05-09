# Using htmd from an AI agent

This is the long-form version of [`SKILL.md`](../SKILL.md). Read this if you want the why; read SKILL.md if you just want the what.

## The premise

Your job as an agent often ends with "produce some output for the user." The user wants:

- **Information density** — they don't want a wall of text.
- **Visual structure** — colors, hierarchy, scanability.
- **Interactivity, sometimes** — if you're showing a comparison, drag-drop or toggling helps.
- **Portability** — they want to email it, save it, share a URL.

You have three choices for that output:

1. **Markdown.** Cheap, but flat — no charts, no color, no interactivity.
2. **Raw HTML.** Rich, but each line of HTML costs ~2.5× the equivalent line of Markdown. And you'll skip dark mode, accessibility, print styles, etc., because each one costs more tokens.
3. **htmd template.** Cheapest of all (you emit just the data), and the result is *better* than what you'd produce by hand because the template author already solved dark mode + a11y + print + sparklines + responsive layout once.

## The decision rule

```
Is the output prose or a simple list?
  YES → Markdown.
  NO  ↓
Does the output fit one of the htmd template shapes?
  YES → htmd template.
  NO  ↓
Is it a one-off complex visual you need full control of?
  YES → Raw HTML.
  NO  → Reconsider whether you actually need rich output.
```

## Workflow

### 1. Discover what's available

```bash
htmd templates
```

If a plugin has been installed (e.g. `htmd-template-gantt`), it shows up here too.

### 2. Get the schema

```bash
htmd schema dashboard
```

This returns JSON Schema. Two things to look for:

- **`required`** — fields you must include.
- **`properties.*.enum`** — for fields with constrained values (e.g. `format: number|currency|percent`).

### 3. Construct data

Prefer YAML over JSON — it's more token-efficient. Use multi-line strings for body text.

### 4. Render

```bash
htmd render dashboard --data /tmp/data.yaml --out /tmp/dashboard.html
```

Or:

```bash
htmd render dashboard --inline '{"title":"...", "metrics":[...]}'
```

Or pipe via stdin:

```bash
cat <<'EOF' | htmd render dashboard --data -
title: Q2 metrics
metrics:
  - { label: MAU, value: 4820 }
EOF
```

### 5. Tell the user about the output

Don't dump the HTML in chat — that wastes tokens. Tell the user something like:

> I've generated a dashboard at `/tmp/dashboard.html` — open it in a browser. It's self-contained (no external assets), so you can email or share it as-is.

## Token cost comparison

| Approach | Input tokens | Output tokens | Total |
|---|---:|---:|---:|
| Write MD inline | 0 | ~400 | 400 |
| Write HTML inline | 0 | ~1,000 | 1,000 |
| **htmd template** | **~150 (data)** | **~30 (the "I rendered it" message)** | **~180** |

For a status report. For a dashboard with 8 KPI cards and sparklines, the gap is even wider — roughly 5-10× saving over inline HTML.

## When NOT to use a template

- The user asks for plain text or Markdown explicitly.
- The output is a single sentence or short list.
- The shape doesn't fit any template and you need it once. (Don't force-fit.)
- The target is a chat surface that doesn't render HTML well.

## Choosing the right template

| If you're producing... | Use |
|---|---|
| Weekly status, sprint update, ship review | `status-report` |
| Executive metrics, KPI snapshot, OKR | `dashboard` |
| Tech selection, vendor evaluation, weighted decision | `decision-matrix` |
| Architecture options, build-vs-buy, framework picks | `comparison-3-up` |
| Inbox triage output, daily digest | `email-digest` |
| A short presentation, demo deck | `slide-deck` |
| Iterating on a prompt with a colleague | `prompt-tuner` |
| Roadmap, backlog, sprint plan | `kanban-board` |
| Onboarding doc, technical explainer, RFC summary | `concept-explainer` |

## Validating before rendering

If you construct data programmatically and want to validate without rendering:

```js
import { compile } from 'htmd/src/schema.js';
import { loadTemplate } from 'htmd/src/templates.js';

const tpl = await loadTemplate('dashboard');
const validate = compile(tpl.schema);
if (!validate(data)) {
  console.error(validate.errors);
}
```

The CLI does this automatically. `--no-validate` skips it.

## What htmd is not

- **Not a static site generator.** No multi-page output, no routing.
- **Not a chart library.** It has 4 chart types because templates need them; if you want serious dataviz, use Vega.
- **Not a CMS.** No content database, no auth, no multi-user editing.

It's a focused tool: turn data into one beautiful HTML file. That's it.
