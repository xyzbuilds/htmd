---
name: htmd
description: Render agent output to rich self-contained HTML using htmd templates instead of writing HTML directly. Use compose to mix prose + many interactive widgets in one markdown file with one global "Copy all changes" button that aggregates all human edits back into one prompt for the agent. Templates: status-report, dashboard, decision-matrix, comparison-3-up, email-digest, slide-deck, prompt-tuner, kanban-board, concept-explainer, feedback-corrector, checklist, q-and-a, data-table, approval-list, rank-order, text-redline, priority-matrix.
---

# htmd — Markdown ↔ HTML bridge for human-in-the-loop agents

When you need to produce visually-rich output **and want the human to interact with it and respond back to you**, prefer htmd over writing HTML inline. You emit ~150 tokens of YAML; htmd gives the user back ~1,500 tokens of styled, interactive HTML with **a button that copies their edits back to you as a clean prompt**.

## The decision tree

1. Plain prose / a few lines → **emit Markdown.** Cheapest.
2. **Multiple structured blocks in one page** (e.g. status + checklist + corrections + ranking) → **author ONE markdown file with `\`\`\`htmd:<template>` fences and run `htmd compose`**. The page gets one global "Copy all changes" button that aggregates every human edit into one prompt for you.
3. A single data-shaped widget → `htmd render <template> --data input.yaml --out file.html`.
4. Unsure which template fits a piece of plain markdown the user gave you? → `htmd detect <file.md>` returns a JSON list of template suggestions per region with sample YAML.
5. The user mutated state in the browser (kanban moves, label changes, checks) and saved the HTML? → `htmd extract <file.html>` returns the embedded state as YAML so you can re-ingest.
6. Truly one-off complex visual → raw HTML.

## Template shapes

| If you're producing... | Template |
|---|---|
| Weekly status / sprint update | `status-report` |
| KPI snapshot, executive metrics | `dashboard` |
| Trade-off / scoring decision | `decision-matrix` |
| 2–4 way option comparison | `comparison-3-up` |
| Inbox digest | `email-digest` |
| Slide deck | `slide-deck` |
| Prompt iteration with stakeholders | `prompt-tuner` |
| Roadmap / kanban view | `kanban-board` ↔ |
| Onboarding doc / RFC summary | `concept-explainer` |
| Classification corrections | `feedback-corrector` ↔ |
| Task list to tick off | `checklist` ↔ |
| Clarifying questions for the human | `q-and-a` ↔ |
| Sortable / filterable data | `data-table` ↔ |
| Approve / reject items | `approval-list` ↔ |
| Drag-to-rank a list | `rank-order` ↔ |
| Inline-edit a draft (paragraph by paragraph) | `text-redline` ↔ |
| 4-quadrant drag-drop (Eisenhower etc.) | `priority-matrix` ↔ |

(↔ = bidirectional: includes a Copy-back button.)

## How to use it

**0. Compose (the main use case — multi-block markdown → one HTML page)**

```bash
htmd compose review.md --out review.html
```

Where `review.md` looks like:

````markdown
# Sprint review

Some intro prose.

```htmd:status-report
title: Week 19
sections:
  shipped: [{ title: htmd compose }]
```

```htmd:approval-list
title: PRs awaiting review
items:
  - { id: pr1, title: "feat: compose", suggested: approve }
```
````

The fence language is `htmd:<template-name>`. The body is YAML (or JSON). Multiple fences become multiple widgets sharing one polished page; **a global "Copy all changes" button aggregates every human edit into one prompt** that the human pastes back to you. Tell the human:

> I generated `/tmp/review.html`. Open it in a browser, make any corrections, then click "Copy all changes" at the bottom-left and paste the result back to me.

**1. List templates:** `htmd templates`

**2. Get a schema:** `htmd schema status-report` (JSON Schema; required, types, enums)

**3. Single render:** `htmd render <template> --data input.yaml --out report.html` (or `--inline '{...}'`, or read from stdin with `--data -`)

**4. Detect:** `htmd detect <file.md>` — for plain markdown, returns suggestions of the form `{template, confidence, line_start, line_end, sample_data_yaml}`. Use this when given user markdown to figure out which sections should become widgets.

**5. Extract:** `htmd extract <file.html>` — recover the embedded state of a rendered (and possibly interacted-with) HTML file as YAML. Useful when the human saves the file or sends it back instead of pressing the Copy button.

**6. Programmatic:**
```js
import { renderTemplate, composeFromMarkdown, detectTemplates, extractState } from 'htmd';
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
