---
name: htmd
description: Render agent output to rich self-contained HTML using htmd templates instead of writing HTML directly. Use compose to mix prose + many interactive widgets in one markdown file with one global "Send / Copy all changes" button that aggregates all human edits back into one prompt for the agent. With `--serve` (v0.3.0) the page is also hosted at a URL so iPhone users can open + reply without copy-paste. Templates: status-report, dashboard, decision-matrix, comparison-3-up, email-digest, slide-deck, prompt-tuner, kanban-board, concept-explainer, feedback-corrector, checklist, q-and-a, data-table, approval-list, rank-order, text-redline, priority-matrix.
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

## Serving the page so the user can reply on their phone (`--serve`, v0.3.0)

If the user is mobile (Telegram on iPhone, etc.) and you want their interaction with the page to come **back to you automatically** (instead of asking them to copy-paste a prompt), use the `--serve` flag:

```bash
htmd compose review.md --serve
# prints: http://100.70.189.117:8787/r/review-a1b2c3d4
```

Send that URL in your reply. When the user opens it on their phone, the in-page FAB is now a two-stage **"Send all changes"** button (instead of just "Copy"): tapping Send POSTs the assembled prompt to `htmd serve` on the user's machine, which routes it back to your agent session (mode-dependent: `dryrun` / `file` / `telegram` / `openclaw-ssh`).

Requirements:
- `htmd serve` must be running on the user's machine; if it isn't, the file is still written and the URL still printed, but with a stderr warning.
- The page is back-compat — if the user opens an htmd page that was **not** rendered with `--serve`, the FAB falls back to the v0.2 "Copy" behavior.

When to prefer `--serve`:
- The user is on mobile and you want a low-friction round trip.
- The compose page has interactive blocks (`checklist`, `feedback-corrector`, `kanban-board`, etc.) where the user's edits matter.
- The user is on a private network you can reach (Tailscale / LAN).

When NOT to prefer it:
- The output is purely informational (no interactive blocks).
- You're emailing the page or attaching it to a chat that doesn't have inline HTML rendering.

See `docs/SERVE.md` for the full operational guide (port choice, auth tokens, the four submit pipeline modes, troubleshooting).

## Telegram Mini App mode (v0.4.0)

When the same `htmd compose --serve` page is opened **inside Telegram** (via an inline-keyboard `web_app` button), it auto-upgrades into a Mini App: Telegram's native MainButton replaces the in-page FAB and the submit goes through `tg.sendData()` (signed by Telegram, no HTTP POST). One render, two paths — Safari standalone still works exactly the same.

How to send a Mini App entry point as an agent:

```bash
# 1. Publish a page (requires HTMD_MINI_APP_BASE set in the serving shell)
htmd compose triage.md --serve
# prints (when HTMD_MINI_APP_BASE is set):
#   http://100.70.189.117:8787/r/triage-XXXXXXXX
#   https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/triage-XXXXXXXX   ← mini-app URL

# 2. Emit a chat-message envelope with an inline web_app button
htmd button --url 'https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/triage-XXXXXXXX' \
            --text 'Open triage' \
            --message 'Triage list ready — tap below.'
```

`htmd button` writes a JSON envelope (chat_id, text, reply_markup.inline_keyboard with a `web_app` button). Pipe it to whatever talks to the Telegram Bot API; for OpenClaw, the existing telegram-sender adapter accepts this shape.

When the user taps the MainButton inside the Mini App, Telegram delivers `update.message.web_app_data` to the bot. The receiving side (htmd's `/tg-webhook` endpoint or the standalone `scripts/openclaw-webappdata-hook.mjs`) unwraps the JSON and routes it through the same `openclaw agent --message ... --deliver` path as the FAB POST — so the agent sees a normal user turn.

See `docs/MINI_APP_SETUP.md` for the one-time setup (Tailscale Funnel route, BotFather registration, webhook secret, end-to-end test plan).

## Plugin templates

If a template you want isn't built-in, check `htmd templates` — it lists installed plugins (npm packages named `htmd-template-*`). Suggest the user `npm install htmd-template-foo` if they want it.
