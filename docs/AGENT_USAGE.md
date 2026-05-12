# Using htmd from an AI agent

Long-form companion to [`SKILL.md`](../SKILL.md). Read this if you want the *why*; SKILL.md if you just want the *what*.

## The premise

Your job as an agent often ends with "produce some output for the user." The user wants:

- **Information density** — not a wall of text.
- **Visual structure** — colors, hierarchy, scanability.
- **Interactivity, sometimes** — pick, drag, check, comment, redline.
- **Portability** — email it, save it, share a URL.
- **A path back** — when they make a decision in the browser, you (the agent) need to learn what they decided.

That last bit is what htmd is *really* about. The output isn't terminal — it's a checkpoint in a loop. The human sees the artifact, makes choices, hits a button, the structured output comes back to you as a fresh prompt. You stay in the loop; the loop gets tighter.

## Three ways to use htmd

### 1. `htmd render` — single template

The classic API. One YAML in, one HTML out.

```bash
htmd render dashboard --data /tmp/metrics.yaml --out /tmp/dashboard.html
```

Use when you have **one** widget to show.

### 2. `htmd compose` — multi-block markdown ⇒ one HTML page

You author **one Markdown file** with prose + multiple ` ```htmd:<template> ` fenced blocks. htmd renders prose with `marked`, renders each block via the named template, dedupes shared CSS/JS, and wraps everything in one shell with one **global "Copy all changes" floating action button** that aggregates *every* interactive block's state into one prompt for the human to send back to you.

```bash
htmd compose /tmp/sprint-review.md --out /tmp/review.html
```

Use this whenever the user wants a single shareable artifact mixing narrative + interaction. **This is the headline feature.**

The compose markdown looks like:

````markdown
# Sprint review

A few sentences of context here.

```htmd:status-report
title: Week 19
sections: { shipped: [{ title: foo }] }
```

More prose between blocks.

```htmd:approval-list
title: PRs to decide
items: [...]
```
````

What the human sees:
- The prose, beautifully styled.
- Each fence becomes a real interactive widget (status report, approval list, …).
- A global "Copy all changes" button at the bottom-left. Clicking it opens a modal with the aggregated prompt and a Copy button.

### 3. `htmd detect` — suggest what to compose

Given a plain Markdown file (no fences), `htmd detect` heuristically suggests which sections would benefit from being rendered as widgets.

```bash
htmd detect /tmp/notes.md --json
```

Returns:

```json
[
  {
    "template": "status-report",
    "confidence": 0.85,
    "line_start": 4,
    "line_end": 19,
    "reason": "Found status-style headings: Shipped, In Progress, Blocked",
    "sample_data_yaml": "title: ...\nsections: ..."
  }
]
```

Use this when the user gives you *plain markdown* and you want to decide which parts to swap for widgets.

### 4. `htmd extract` — close the loop

The Copy-back button is the primary path. But if the user *saves the HTML file* and sends it to you, you can recover their state:

```bash
htmd extract /tmp/review.html
```

Outputs YAML (or `--json`) of every embedded `data-htmd-state` block. Works for kanban moves, label corrections, checked items, ranked orders, redlined paragraphs, etc.

## Workflow recipes

### Composing a multi-widget review

1. Author a Markdown file. Use ` ```htmd:<template> ` fences for each interactive section.
2. Validate cheaply: `htmd schema <template>` to confirm your data shape, or just run compose and read any per-block error messages from stderr.
3. `htmd compose file.md --out file.html`.
4. Tell the user: *"I generated `<path>`. Open it in a browser, make any changes, then click "Copy all changes" at the bottom-left and paste the result back to me."*
5. When their pasted prompt arrives, parse the per-block sections (each is delimited by `--- Block N (template):`) and act.

### Receiving a markdown brief from the user

1. `htmd detect file.md --json` → list of suggestions.
2. Decide which to convert to widgets.
3. Write a new compose markdown that combines the original prose with the proposed widgets.
4. `htmd compose new.md --out new.html`.
5. Send back to the user.

### Re-ingesting a saved artifact

1. User saves `review.html` after editing.
2. `htmd extract review.html` → YAML of all states.
3. Parse + act.

### 4. `htmd compose --serve` — hosted URL + Send-to-agent (mobile-friendly)

Same compose markdown as #2, but published to a local HTTP server and made tappable from a chat client. The page also gains a "Send to agent" FAB action that POSTs the structured prompt to the agent directly — no copy/paste.

```bash
htmd compose /tmp/friday-triage.md --serve --out /tmp/friday-triage.html
# prints: http://<host>:8787/r/friday-triage-9d84c259
```

Send the URL to the user. They tap, interact on phone or desktop, hit **Send to agent**, and the submission lands back in your conversation via the configured submit pipeline (`HTMD_SUBMIT_MODE`).

**When to use `--serve` vs default:**

| Scenario | Use |
|---|---|
| User is on a phone (Telegram/SMS/email viewing) | `--serve` |
| User wants a single-file artifact to save/forward | default (file) |
| You expect them to make decisions and hand state back | `--serve` |
| One-shot status report / dashboard for the eye | default |

Prereq: an `htmd serve` daemon must be running and reachable by the user. The daemon and OpenClaw should co-locate on the same machine so the submit pipeline can call OpenClaw via localhost (rather than SSH-proxying).

### What the agent receives on Send

POSTs are JSON. The payload your handler sees:

```json
{
  "id": "friday-triage-9d84c259",
  "contextId": "friday-triage-9d84c259",
  "prompt": "...top-level assembled prompt, concatenated across all blocks that had changes...",
  "blocks": [
    {
      "template": "feedback-corrector",
      "blockId": "<from the compose fence>",
      "hasChanges": true,
      "prompt": "...per-block prompt fragment..."
    }
  ],
  "receivedAt": "2026-05-12T14:56:38.425Z"
}
```

Filter on `hasChanges: true` to ignore blocks the user did not touch. The top-level `prompt` is a single coherent text the agent can ingest as if the user typed it. Each block's individual `prompt` is also preserved for cases where the agent wants to handle templates separately.

### What to do when the user submits

When a user submits via the FAB, the configured pipeline routes the structured prompt into the agent's chat as if the user typed it. The next turn the agent sees is the assembled prompt. Respond conversationally — confirm what changed, ask follow-ups, or act on the decisions.


## Token-cost intuition

| Approach | Tokens (one weekly review) |
|---|--:|
| Write Markdown inline | ~400 |
| Write HTML inline | ~1000 |
| `htmd render` | ~150 (data) + ~30 (your "I rendered it" message) |
| `htmd compose` (5 widgets in one MD file) | ~600 (one composed MD file) + ~30 |

The relative win grows with widget count.

## What htmd is NOT

- Not a static-site generator. No multi-page output, no routing.
- Not a chart library. There are 4 chart helpers because templates need them.
- Not a CMS, not a backend. One markdown in, one HTML out.
- Not a framework. Templates are plain ESM modules with a `html\`\`` tagged literal.
