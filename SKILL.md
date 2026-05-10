---
name: htmd
description: Render structured agent output to rich self-contained HTML using htmd templates instead of writing HTML directly. Use when you need a status report, dashboard, decision matrix, comparison, email digest, slide deck, prompt-tuner, kanban board, concept explainer, or feedback corrector for reviewing AI classifications.
---

# htmd — token-cheap rich HTML for agents

When you need to produce visually-rich output (a status report, dashboard, decision matrix, slide deck, classification corrector, etc.), **prefer htmd templates over writing HTML inline**. You emit ~150 tokens of YAML; htmd gives the user back ~1,500 tokens of styled, interactive HTML. Charts, dark mode, print stylesheets, accessibility — included.

## When to use htmd

Decision rule:

1. **Plain prose / lists / simple tables → emit Markdown.** Cheapest, agents do this well.
2. **Structured/data-shaped output that benefits from rich layout → use an htmd template.**
3. **Truly one-off complex visual you need full control of → write raw HTML.**

If your output fits one of these shapes, use a template:

| Shape | Template |
|---|---|
| Weekly status, sprint update | `status-report` |
| KPI grid, executive metrics | `dashboard` |
| Trade-off / scoring decision | `decision-matrix` |
| Three-approach comparison | `comparison-3-up` |
| Inbox/email summary | `email-digest` |
| Single-file presentation | `slide-deck` |
| Prompt iteration with stakeholders | `prompt-tuner` |
| Roadmap / sprint planning | `kanban-board` |
| Educational explainer doc | `concept-explainer` |
| Human-in-the-loop classification corrections | `feedback-corrector` |

## How to use it

**1. List templates:**
```bash
htmd templates
```

**2. Get the schema for the one you want:**
```bash
htmd schema status-report
```

This returns JSON Schema. Use it to construct valid input — it documents required fields, types, and enums.

**3. Render:**
```bash
htmd render status-report --data input.yaml --out report.html
```

Or inline:
```bash
htmd render dashboard --inline '{"title":"Q2","metrics":[{"label":"MAU","value":12000,"delta":8.3}]}'
```

Or from stdin:
```bash
echo '...' | htmd render status-report --data -
```

**4. Programmatic from another Node script:**
```js
import { renderTemplate } from 'htmd';
const html = await renderTemplate('decision-matrix', data);
```

## Validation

htmd validates input against the template's JSON Schema before rendering. On failure, the error names the offending field — you can fix the data and retry. Or pass `--no-validate` to skip (not recommended).

## Example invocations

### status-report
```yaml
title: Week of May 5
sections:
  shipped:
    - title: Shipped feature X
      owner: alice
  in_progress:
    - title: Working on Y
      eta: next week
  blocked:
    - title: Z
      blocker: waiting on API access
metrics:
  - { label: Tests passing, value: "127/127" }
  - { label: Active users, value: 4820, delta: 8.3 }
```

### dashboard
```yaml
title: Weekly KPIs
metrics:
  - label: MAU
    value: 48720
    delta: 8.3
    trend: [38000, 39200, 41100, 42800, 43900, 46100, 48720]
  - label: Revenue
    value: 184500
    format: currency
    delta: 12.1
```

### decision-matrix
```yaml
question: Which database for v2?
criteria:
  - { name: Performance, weight: 5 }
  - { name: Cost, weight: 3, direction: lower_better }
options:
  - name: Postgres
    scores: { Performance: 8, Cost: 4 }
  - name: ClickHouse
    scores: { Performance: 10, Cost: 6 }
```

(See `templates/<name>/example.yaml` for full examples of every template.)

## Tips for agents

- **Always fetch schema first** if you're unsure — `htmd schema <name>` is cheap.
- **YAML is more token-efficient than JSON** for the `--data` payload.
- The `--out file.html` flag is preferred — emitting HTML through stdout into your conversation wastes tokens.
- Ask the user to open the HTML file in a browser to view it. The output is self-contained (no CDNs, no network) so it works offline and can be emailed.
- For interactive templates (slide-deck, prompt-tuner, kanban-board, concept-explainer, feedback-corrector) the HTML includes inlined JS — the user gets a working widget by opening the file.

## Plugin templates

If a template you want isn't built-in, check `htmd templates` — it lists installed plugins (npm packages named `htmd-template-*`). Suggest the user `npm install htmd-template-foo` if they want it.
