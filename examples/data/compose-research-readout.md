# Q2 retention research read-out

Researcher: Cara · Reviewers: Alice, Bob · Draft: v3

We ran a 4-week study on the new onboarding flow. Below is the headline KPI table, the engagement curve, the draft narrative for the share-out doc (please redline), and a checklist of follow-ups.

## Headline metrics

```htmd:data-table
title: Cohort comparison — old vs new onboarding
subtitle: "Sample size: 12,400 users per cohort. Edit any cell if you'd update the methodology or the framing."
editable: true
row_key: metric
prompt_intro: Updates to the headline metrics table.
columns:
  - { key: metric,    label: Metric,     editable: false }
  - { key: old,       label: "Old flow", type: number, align: right }
  - { key: new,       label: "New flow", type: number, align: right }
  - { key: delta_pct, label: "Δ %",      type: percent, align: right }
  - { key: confidence, label: Confidence, type: badge, align: center }
  - { key: notes,     label: Notes }
rows:
  - { metric: "Day-1 activation rate",    old: 0.412, new: 0.563, delta_pct: 0.366, confidence: high,   notes: "Largest single lift; statistically significant." }
  - { metric: "Day-7 retention",          old: 0.282, new: 0.341, delta_pct: 0.209, confidence: high,   notes: "Confirms the activation effect persists." }
  - { metric: "Day-30 retention",         old: 0.178, new: 0.198, delta_pct: 0.112, confidence: med,    notes: "Smaller lift; needs another month for confidence." }
  - { metric: "First-purchase rate",      old: 0.041, new: 0.058, delta_pct: 0.415, confidence: med,    notes: "Could be cohort skew; verify." }
  - { metric: "Support tickets/user",     old: 0.18,  new: 0.11,  delta_pct: -0.389, confidence: high,  notes: "Fewer questions = clearer flow." }
  - { metric: "Avg time-to-activate (s)", old: 184,   new: 92,    delta_pct: -0.500, confidence: high,  notes: "Cut roughly in half." }
```

## Engagement curve

```htmd:chart-block
title: Day-1 activation rate by cohort week
subtitle: 4-week rolling cohorts; both flows running in parallel since week 14.
caption: The new flow's activation rate stabilized around 56% after week 16, ~15 pts above the old flow.
kind: line
series:
  - { name: "Old flow",  values: [0.40, 0.41, 0.41, 0.40, 0.42, 0.41, 0.42, 0.40, 0.41, 0.42, 0.41, 0.42] }
  - { name: "New flow",  values: [0.43, 0.46, 0.49, 0.52, 0.54, 0.55, 0.56, 0.56, 0.57, 0.56, 0.56, 0.57] }
show_table: true
```

## Draft executive summary — please redline

```htmd:text-redline
title: Draft of the share-out doc
subtitle: Edit any paragraph. Use the &times; button to reject one entirely.
prompt_intro: Redlined exec summary for the retention readout.
segments:
  - id: s1
    text: "We ran a 4-week experiment comparing the legacy onboarding flow to a redesigned version that emphasizes immediate value-delivery in the first three screens. The redesigned flow won every metric we tracked, with the largest effect on day-1 activation."
  - id: s2
    text: "Day-1 activation rose from 41% to 56% (+37%, p < 0.001) — the largest lift of any onboarding change in the past two years. Day-7 retention followed, rising from 28% to 34% (+21%, p < 0.001), which suggests the activation gain isn't a one-day mirage."
  - id: s3
    text: "Operationally, the new flow generated ~40% fewer support tickets per user. Together with the activation lift, this implies the new flow is both more effective and cheaper to operate."
  - id: s4
    text: "Recommendation: ship the new flow to 100% of new users by end of the next sprint. Keep the old flow available behind a feature flag for one month in case rollback is needed."
  - id: s5
    text: "Caveats: day-30 retention lift (+11%) is smaller and would benefit from another month of data. First-purchase rate jumped 42% but the absolute number is small; we should verify with another month before claiming this as a revenue lever."
    locked: true
```

## Follow-ups

```htmd:checklist
title: Follow-up tasks for the readout
prompt_intro: Status of the readout follow-up tasks.
items:
  - { id: f1, title: "Reframe day-30 number with the 'needs another month' caveat in the deck",  priority: high }
  - { id: f2, title: "Verify the first-purchase number against the finance dashboard",            priority: high, owner: cara }
  - { id: f3, title: "Re-run the chart with the 'mobile only' segment to check parity",           priority: med, owner: cara }
  - { id: f4, title: "Slack #product with the headline numbers + link to this doc",               priority: low, owner: alice }
  - { id: f5, title: "Schedule the all-hands read-out for Tuesday",                               priority: low }
```

When you're done editing the table, redlining the draft, and ticking off any tasks you've already done, hit **Copy all changes** to send everything back to the agent in one prompt.
