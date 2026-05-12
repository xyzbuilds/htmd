# htmd serve — round-trip demo

This page is intended to be served via `htmd compose --serve`. Open it on your
phone's browser (Safari/Chrome), make some changes in the widgets below, then
tap the floating **"Send all changes"** button at the bottom-left.

The submit endpoint embedded in this page will POST the assembled prompt back
to your OpenClaw agent — no copy-paste needed.

## Quick approvals

```htmd:approval-list
title: Things to decide right now
prompt_intro: Decide each one — approve, reject, or hold for follow-up.
items:
  - id: lunch
    title: Pick a lunch spot
    subtitle: Today, 1pm
    body: "Options: ramen / poke / pho. Pick one or hold."
    suggested: hold
  - id: blog-post
    title: Publish this week's Rednote post
    subtitle: drafted yesterday
    body: "Approve to publish, hold to keep editing, reject to scrap."
    suggested: approve
  - id: pr-2031
    title: Merge feedback-corrector v2 PR
    subtitle: 2 reviewers approved
    body: "All checks green. Approve to merge."
    suggested: approve
```

## One quick checklist

What did you actually finish today? Tick whatever applies — the agent will
fold the answers into a single status update.

```htmd:checklist
title: End-of-day check
items:
  - title: Ran morning workout
  - title: Replied to AT&T thread
  - title: Reviewed open PRs
  - title: Watered plants
  - title: Logged voice memo for tomorrow
```

## Feedback on yesterday's drafts

```htmd:feedback-corrector
title: Draft labels — confirm or correct
context_id: serve-demo
prompt_intro: "I'm prefilling labels I think apply to each draft; correct any I got wrong."
labels:
  - value: keep
    label: Keep
    color: green
  - value: revise
    label: Revise
    color: amber
  - value: drop
    label: Drop
    color: red
items:
  - id: d-001
    title: "Draft: htmd serve announcement post"
    body: "Today I shipped htmd serve — phones can now load rich compose pages from a URL instead of a download. Round-trip works. Here's a screenshot..."
    current_label: keep
  - id: d-002
    title: "Draft: Rednote intro for the new sprite series"
    body: "新系列 sprite 上线啦 — 小红书首发，每周三更新。点个关注不迷路！🍎"
    current_label: keep
  - id: d-003
    title: "Draft: AT&T invoice reminder template"
    body: "Hey — quick reminder, your AT&T line for this month is $X.XX. Same Venmo as before. Let me know if you want a copy of the bill."
    current_label: revise
```

## Final thoughts

Anything else?

```htmd:q-and-a
title: Two quick questions
prompt_intro: Answer in the boxes below — leave blank to skip.
questions:
  - id: tomorrow
    prompt: One word for how tomorrow should feel?
    kind: free
  - id: blocker
    prompt: Anything you need from me to unblock something?
    kind: free
```

When you tap **Send all changes**, every block above is folded into one prompt
and POSTed back to the agent. You'll see a toast saying "Sent to agent — check
your chat", and your normal Telegram chat will get a new agent turn with your
edits.

If you'd rather copy the prompt and paste it yourself, the modal has a **Copy**
button too — that still works exactly like v0.2.
