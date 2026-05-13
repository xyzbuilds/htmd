---
name: user working preferences (non-supervised mode)
description: How this user wants Claude to operate when they say "non-supervised" or "I'll check when I wake up".
type: feedback
originSessionId: 2f1cd333-f04c-46b8-9ae7-843760fafb14
---
When the user invokes "non-supervised mode" / "don't ask me questions" / "I'll check when I wake up", they expect Claude to:
- Skip clarifying-question skills (brainstorming) entirely.
- Take initiative on scope: when they say "iterate as much as possible," default to broader scope, more templates, more polish — not less.
- Surface assumptions in writing (CLAUDE.md, code comments) but proceed without confirmation.
- Verify work end-to-end (run tests, render outputs, smoke-test in a real browser) before declaring done.

**Why:** Confirmed in the May 2026 htmd 0.2 build session: user said "non-supervised mode, so don't ask me questions, i will check the result when i wake up" and later "Iterate as much as you can to include all possible template you can think of." When given that instruction set, smaller scope = under-delivering.

**How to apply:** Read explicit user permission to "go big" as a license to add more templates, more tests, more docs, more end-to-end verification — not as a license to skip review or sloppily move forward. The user reads diffs the next morning; the artifact has to be defensible.
