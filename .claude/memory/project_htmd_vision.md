---
name: htmd vision and thesis
description: The core "why" of the htmd project, drawn from Thariq Shihipar's HTML-effectiveness essay and the user's framing.
type: project
originSessionId: 2f1cd333-f04c-46b8-9ae7-843760fafb14
---
htmd is positioned as a **bidirectional bridge** between agents (who speak Markdown cheaply) and humans (who consume rich HTML easily). The artifact is not the destination — it is a checkpoint in a loop:

> Human → Agent → HTML artifact → Human interaction → Structured output → Agent

**Why:** Inspired by Thariq Shihipar's *The Unreasonable Effectiveness of HTML for AI Agents* (https://thariqs.github.io/html-effectiveness/). His key insight: *"You stay in the loop; the loop gets tighter."* Every artifact ends with an export button that turns whatever the human did in the UI back into something they can paste into the agent.

**How to apply:** When designing or extending htmd templates, ask: "What is the export?" Every interactive template should have a button that copies the human's edits back as a structured agent-consumable prompt. The user explicitly cited the existing `feedback-corrector` template as the canonical pattern — new templates should aim for that level of value.

The user's framing in this project: HTML is heavy for an agent to author but valuable for a human to consume; htmd lets agents emit cheap YAML/Markdown and humans get the rich HTML for free. Multiple scenarios in one markdown file is the headline use case.
