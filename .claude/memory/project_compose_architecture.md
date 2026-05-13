---
name: compose architecture and the window.__htmd export protocol
description: How htmd compose stitches multiple template blocks into one HTML page, and how interactive templates register their export functions for the compose-level FAB.
type: project
originSessionId: 2f1cd333-f04c-46b8-9ae7-843760fafb14
---
`htmd compose <file.md>` parses Markdown via `marked.lexer`, finds fenced code blocks whose language is `htmd:<template-name>` (or `htmd <template-name>`), parses each fence body as YAML/JSON, and renders each through `renderTemplateParts(name, data)` (the body-only sibling of `renderTemplate`). Prose between fences flows through `mdToHtml`. CSS and JS per template are deduped via `Map<template, src>` and inlined into one shell.

**Why:** This is the headline feature — agents author one Markdown file mixing prose with multiple interactive widgets; humans get one shareable page; one global "Copy all changes" button at the bottom-left aggregates every interactive block's prompt into one piece of text the human pastes back to the agent.

**How to apply:** When adding a new interactive template, its `script.js` must:
1. Wrap everything in an IIFE.
2. Read initial state from a `<script type="application/json" data-<short>-state data-htmd-state="<template>">...</script>` element scoped to the template's root (use `root.querySelector` not `document.querySelector`).
3. Register an exporter into the global registry near the end:
   ```js
   if (!window.__htmd) window.__htmd = { blocks: [] };
   window.__htmd.blocks.push({
     template: 'my-template',
     blockId: state.block_id || state.title,
     hasChanges: () => /* boolean */,
     getPrompt: () => /* string sent back to the agent */
   });
   ```

The `data-htmd-state` attribute is also what `htmd extract` looks for to recover state out of a rendered HTML file (closes the loop when the human saves the file rather than clicking Copy).

Templates must use the `html\`\`` tagged literal from `src/html-tag.js` — it auto-escapes everything except values wrapped in `h.raw(...)`. JSON state should be wrapped in `h.raw(safeJson(state))` so it isn't HTML-escaped (caused a real bug with kanban-board where `JSON.stringify(...)` interpolated as `&quot;` instead of `"`).
