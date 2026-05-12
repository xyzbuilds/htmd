# Friday inbox triage — May 12

Three things to clear before the weekend: today's inbox digest, a batch of email-classifier corrections to feed back to the model, and a few PRs that need decisions. Pick actions on each, then **Copy all changes** at the bottom-left.

## Today's inbox

```htmd:email-digest
date: 2026-05-12
prompt_intro: Inbox actions for May 12.
summary: { urgent: 3, useful: 4, noise: 78 }
urgent:
  - { from: Stripe, subject: "Action required — verify business address by May 14", summary: "3 days to verify or payouts pause. Has form link.", action: Reply, ts: "9:14 AM" }
  - { from: Sarah (Acme), subject: "Re: Q3 contract — needs signature today", summary: "Redlines accepted; waiting on signature before EOD to lock the rate.", action: Reply, ts: "8:02 AM" }
  - { from: GitHub, subject: "[security] Critical CVE in turndown — patch available", summary: "Affects 2 repos. Update to 7.2.0.", action: Reply, ts: "6:44 AM" }
useful:
  - { from: Anthropic, subject: "Claude 4.7 release notes", summary: "Extended thinking, 50% lower batch pricing, MCP improvements.", ts: "7:30 AM" }
  - { from: Lenny's Newsletter, subject: "How great PMs interview candidates", summary: "4-question framework: signal, scope, speed, sticking.", ts: "6:00 AM" }
  - { from: AWS, subject: "Lambda costs dropped 18% MoM", summary: "Memory tuning recommendations active; ~$340 saved.", ts: "5:55 AM" }
  - { from: Hacker News, subject: "Daily digest", summary: "Linear's CEO on writing as thinking tool, postgres LISTEN/NOTIFY tricks.", ts: "6:00 AM" }
noise_summary: "78 promotional / list emails. Top senders to consider unsubscribing from: Substack digest (12), Medium daily (9), LinkedIn news (8), random SaaS newsletters (40+)."
```

## Classifier corrections

These are emails the inbox classifier labeled this week. If you disagree, flip the label and add a clarification — the agent will use these to retrain.

```htmd:feedback-corrector
title: Recent classifications to verify
context_id: gmail-classifier-2026-05-12
prompt_intro: Triage corrections for the inbox classifier.
labels:
  - { value: URGENT, label: Urgent, color: "#dc2626", emoji: "🔴" }
  - { value: USEFUL, label: Useful, color: "#d97706", emoji: "🟡" }
  - { value: NOISE,  label: Noise,  color: "#94a3b8", emoji: "⚪" }
items:
  - { id: c1, title: "Your AWS bill is ready — $4,127.32",       subtitle: "AWS Billing", current_label: NOISE,  verdict_reason: "Recurring monthly bill" }
  - { id: c2, title: "Re: Re: Re: spec questions for v2",         subtitle: "Bob from platform", current_label: NOISE, verdict_reason: "Long thread, looked like noise" }
  - { id: c3, title: "Your DNS expires in 7 days",                subtitle: "Namecheap",   current_label: USEFUL, verdict_reason: "Pre-expiry warning" }
  - { id: c4, title: "Webinar: Building agentic systems",         subtitle: "AWS Events",  current_label: USEFUL, verdict_reason: "Industry event" }
  - { id: c5, title: "Annual security audit: schedule confirmed", subtitle: "ComplianceCo", current_label: NOISE, verdict_reason: "Newsletter-shaped subject" }
```

## PRs to clear before EOD

```htmd:approval-list
title: Friday PR queue
prompt_intro: Decisions on the Friday PR queue.
items:
  - id: pr1
    title: "fix: prevent crash on empty kanban board"
    subtitle: "alice — +12 / -2"
    suggested: approve
  - id: pr2
    title: "feat: data-table editable mode + diff export"
    subtitle: "alice — +320 / -80"
    body: "New behavior; gated by editable: true"
    suggested: approve
  - id: pr3
    title: "refactor: extract shared FAB CSS into _base"
    subtitle: "bob — +180 / -300"
    body: "Cleanup; touches every interactive template's style.css. Worth it but big diff."
    suggested: hold
  - id: pr4
    title: "docs: rewrite SKILL.md for compose-first usage"
    subtitle: "alice — +210 / -90"
    suggested: approve
  - id: pr5
    title: "deps: bump turndown 7.1 → 7.2 (CVE)"
    subtitle: dependabot
    suggested: approve
```

## Anything else?

```htmd:q-and-a
title: One last check before the weekend
prompt_intro: Quick check before EOD.
questions:
  - id: q1
    prompt: Anything blocking that you'd like me to escalate before Monday?
    kind: free
  - id: q2
    prompt: Should I draft a Friday-end summary for the team channel?
    kind: single
    choices: ["Yes please", "No, I'll do it"]
```

When done: **Copy all changes** sends inbox actions, classifier corrections, PR decisions, and your free-form notes back as one prompt.
