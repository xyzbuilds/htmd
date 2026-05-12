# Sprint review — week of May 11

The agent assembled this single Markdown file with prose and **multiple interactive widgets**. Every widget below has a **Copy back** button; the floating action button at the bottom-left aggregates **all** changes across blocks into one prompt to send back to the agent.

## What we shipped

A compact status of the week:

```htmd:status-report
title: Week 19
sections:
  shipped:
    - title: htmd compose command
      owner: alice
    - title: 7 new bidirectional templates
      owner: alice
    - title: detect + extract commands
      owner: alice
  in_progress:
    - title: Plugin auto-discovery in scoped npm packages
      owner: bob
      eta: next week
  blocked:
    - title: Theme system roadmap
      blocker: waiting on design tokens spec
metrics:
  - { label: Templates shipped, value: 17 }
  - { label: Tests passing, value: "60/60" }
  - { label: New LOC, value: 3400 }
```

## Decisions you need to make

PRs lined up — pick **approve / reject / hold** for each:

```htmd:approval-list
title: PRs awaiting your review
prompt_intro: Decisions on this week's PR queue.
items:
  - id: pr1421
    title: "feat: htmd compose command"
    subtitle: "alice — +612 / -38"
    body: "Adds compose subcommand, src/compose.js, tests."
    suggested: approve
  - id: pr1404
    title: "feat: detect command (DRAFT)"
    subtitle: "alice — +356 / -2"
    body: "Heuristic markdown scanner. Tests added; one detector still flaky on multi-line H2s."
    suggested: hold
  - id: pr1399
    title: "test: round-trip md/html"
    subtitle: "bob — +92 / -0"
    suggested: approve
```

## A few clarifying questions

```htmd:q-and-a
title: Before I queue next sprint
prompt_intro: Answers to your clarifying questions for next sprint planning.
questions:
  - id: q1
    prompt: Which compose use cases should be the headline demo in the README?
    kind: multi
    choices:
      - { value: status, label: "Status reports + KPIs" }
      - { value: triage, label: "Email triage corrections" }
      - { value: review, label: "PR approvals + redline drafts" }
      - { value: planning, label: "Roadmap (kanban + priority-matrix)" }
  - id: q2
    prompt: Should the global FAB also include un-changed blocks (as a 'no changes' note) or only modified ones?
    kind: single
    choices: ["Only modified", "Always include all blocks"]
  - id: q3
    prompt: Anything else I should change about the bidirectional flow?
    kind: free
    placeholder: "free-form notes"
```

## Tasks for this week

```htmd:checklist
title: Friday cut-over checklist
prompt_intro: Where I am on the Friday cut-over.
items:
  - { id: c1, title: "Compose end-to-end smoke test on real markdown", priority: high }
  - { id: c2, title: "Update SKILL.md with the compose flow", priority: high }
  - { id: c3, title: "Re-render examples/", priority: med, done: true }
  - { id: c4, title: "Tag v0.2.0 once docs are merged", priority: med }
  - { id: c5, title: "Tweet the launch with a GIF of the compose page", priority: low }
```

## Triage your inbox

If anything below is mis-classified, pick the right label and add a clarification:

```htmd:feedback-corrector
title: Email triage corrections
context_id: gmail-triage-2026-05-11
prompt_intro: Triage corrections for the inbox classifications.
labels:
  - { value: URGENT, label: Urgent, color: "#dc2626", emoji: "🔴" }
  - { value: USEFUL, label: Useful, color: "#d97706", emoji: "🟡" }
  - { value: NOISE,  label: Noise,  color: "#94a3b8", emoji: "⚪" }
items:
  - { id: e1, title: "ACTION REQUIRED: market data renewal",  subtitle: "Interactive Brokers", current_label: USEFUL, verdict_reason: "Urgent action required to maintain market data" }
  - { id: e2, title: "Updates to the Instacart Terms of Service", subtitle: "Instacart", current_label: NOISE,  verdict_reason: "TOS update" }
  - { id: e3, title: "We processed your payment",              subtitle: "American Express", current_label: USEFUL, verdict_reason: "Transaction confirmation" }
```

## Triage these new tasks (priority matrix)

```htmd:priority-matrix
title: New asks from this week
prompt_intro: Triage of the new asks into the priority matrix.
items:
  - { id: a1, title: "Fix the OAuth refresh bug" }
  - { id: a2, title: "Refactor the legacy billing webhook" }
  - { id: a3, title: "Reply to vendor security questionnaire" }
  - { id: a4, title: "Write Q3 planning doc" }
  - { id: a5, title: "Update the brand guidelines deck" }
```

---

When you're done, click **Copy all changes** at the bottom-left to send everything back to the agent in one prompt.
