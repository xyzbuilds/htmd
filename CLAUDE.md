# CLAUDE.md

Project memory for future Claude sessions. Read this first.

## What htmd is

A Node.js CLI + library that converts **structured agent output** (YAML/JSON) into **rich, self-contained, interactive HTML**. The agent emits ~150 tokens of data; htmd produces ~1,500 tokens of styled HTML with charts, dark mode, accessibility, print stylesheets, and (for some templates) interactive widgets. Zero LLM calls during render. No CDN. No build step.

The vision in one line: **agents speak Markdown; humans want HTML; htmd is the bridge.**

## The bigger idea (the "compose" thesis)

A single agent-authored Markdown file should be able to mix **prose** (which the agent is good at writing cheaply) with multiple **interactive widgets** (status report, kanban, feedback-corrector, etc.) — without the agent having to author HTML or call the renderer per-widget.

Surface area:

- `htmd compose <file.md> --out page.html` — render a Markdown file with embedded ` ```htmd:<template> ` fenced blocks into a single HTML page. Prose becomes prose; each fence becomes the rendered template, all sharing one shell.
- `htmd detect <file.md>` — scan a plain Markdown file and emit JSON suggesting which sections would benefit from which template, with sample YAML conversions. Helps an agent decide *whether* to use a template.
- `htmd extract <file.html>` — pull state JSON back out of an interacted-with HTML file (closes the bi-directional loop for templates like kanban-board where users mutate state in the browser).
- `htmd render <template> --data file.yaml` — single-template render (the original API, unchanged).
- `htmd templates` / `htmd schema <template>` — discovery + validation aids for agents.
- `htmd md2html` / `htmd html2md` — plain bidirectional MD↔HTML.

## Inspiration

- Thariq Shihipar — *The Unreasonable Effectiveness of HTML* (https://thariqs.github.io/html-effectiveness/) — the "agents emit HTML, humans love HTML" insight that started this.
- The `feedback-corrector` template is the canonical "human-in-the-loop returns a prompt to the agent" pattern. New templates should aim to be that valuable.

## Architecture (one paragraph)

ESM Node 20+, no transpilation. CLI in `bin/htmd.js` → `src/cli.js` (commander). Templates live in `templates/<name>/` (`render.js`, `schema.json`, `style.css`, optional `script.js`, `description.md`, `example.yaml`). Render path: load template → ajv-validate against schema → call `render(data, helpers)` (a tagged-template-literal `html\`\`` that auto-escapes) → wrap in shell that inlines `tokens.css` + `reset.css` + template CSS + optional template JS. Charts are inline SVG via `src/chart.js` (zero deps). Plugins are auto-discovered npm packages named `htmd-template-*`.

## Entry points worth knowing

- `src/render.js` — `renderTemplate(name, data, opts)` and `renderTemplateParts(...)` (the latter returns `{body, css, js, title}` for composition); `wrapShell(...)`; `renderMarkdown(md)`.
- `src/compose.js` — `composeFromMarkdown(md, opts)`. Walks the marked lexer, splits prose vs. ` ```htmd:* ` fences, renders each, dedupes CSS/JS, returns a single HTML string.
- `src/detect.js` — `detectTemplates(md)`. Heuristic detectors per template; returns array of suggestions with line ranges, confidence, sample YAML.
- `src/extract.js` — `extractState(html)`. Parses any `<script type="application/json" data-htmd-*>` blocks to YAML.
- `src/templates.js` — registry, plugin discovery.
- `src/html-tag.js` — `html`/`raw`/`escapeHtml`/`cls` tagged template helpers. **All template authors use this.**
- `src/schema.js` — ajv wrapper with friendly error formatting.

## Conventions

- **No emojis in output** unless data calls for them (label emojis in feedback-corrector are user data).
- **No comments in templates** beyond a one-line "why" — code is self-evident, schemas document inputs.
- **CSS uses `var(--htmd-*)` tokens only** — never hardcode colors. Dark mode is automatic via `prefers-color-scheme` in `tokens.css`.
- **Interactive templates wrap their JS in an IIFE** and read initial state from `<script type="application/json" data-<short>-state>...</script>`. Use `data-*` attributes for queries, not classnames.
- **Print stylesheets** for any template likely to be saved/shared.
- **Mobile-first** for templates a human will tap on (feedback-corrector is the model).

## Multi-instance caveat for compose

Each template's `script.js` reads its initial state from a single `[data-<short>-state]` element. If a Markdown file embeds the same interactive template *twice* via compose, only the first widget will hydrate. For v1, document this and recommend at most one of each interactive template per composed page. v2 fix: scope state lookups to the enclosing `[data-htmd-block-idx]` section.

## Testing

`npm test` runs vitest. Coverage:

- `tests/render.test.js` — every template renders its `example.yaml` to valid HTML; XSS escape check.
- `tests/schema.test.js` — schema rejects bad inputs and names the offending field.
- `tests/round-trip.test.js` — md→html→md preserves structure for common cases.
- `tests/compose.test.js` — markdown with htmd: fences renders as a single page with deduped CSS/JS.
- `tests/detect.test.js` — heuristic detectors fire on canonical inputs.
- `tests/extract.test.js` — state JSON round-trips through render + extract.

When adding a template, add it to the `BUILTIN_NAMES` list in `src/templates.js` AND to the loops in `tests/render.test.js`.

## Serving rendered pages (v0.3 — Phase 1)

By default htmd writes one HTML file and the user opens it however they like. **For mobile delivery (Telegram, SMS, email), that path is fragile** — iOS treats `.html` as a download, in-Telegram preview is read-only, JS is spotty, and clipboard from a downloaded file is unreliable. v0.3 adds an optional serve layer.

- `htmd serve [--port 8787] [--bind 0.0.0.0]` — a tiny built-in `node:http` server (no Express, zero new deps) that hosts rendered pages and accepts submissions back from them. Bind to `0.0.0.0` on a private network (Tailscale, LAN) so a phone can reach it.
- `htmd render --serve` and `htmd compose --serve` — publish into `~/.htmd/renders/<slug>-<short-uuid>.html`, inject `<meta name="htmd-submit">` + `<meta name="htmd-render-id">` into `<head>`, print the Tailscale URL, auto-prune renders older than `--ttl-days` (default 7).
- **Two-stage FAB** in compose mode: when the page carries a submit meta tag, the floating button shows a primary "Send to agent" alongside the fallback "Copy". Tapping Send POSTs the structured prompt to the submit endpoint, which routes it back into the agent. When no meta tag is present, the FAB stays single-action Copy (v0.2 back-compat).
- A no-op `Telegram.WebApp` shim ships in the bridge JS so the same compose page can later run as a Telegram Mini App without code changes.

Delivery modes are env-driven (`HTMD_SUBMIT_MODE`):

- `dryrun` — log + 200 (default; safe smoke test)
- `file` — write JSON to `~/.htmd/inbox/`
- `telegram` — direct Bot API `sendMessage`
- `openclaw-ssh` — SSH-proxy into the OpenClaw host, runs `openclaw agent --message ... --deliver --reply-channel telegram --reply-to <chat>` to inject a real agent turn
- `openclaw` (placeholder) — direct HTTP to gateway once `/agent/turn` is stable upstream

When authoring a compose markdown that will go to a phone, use `--serve`. For desktop or one-shot attachment artifacts, the default file-write path is still right.

See `docs/SERVE.md` for the operational guide and `NOTES.md` for Phase 2 follow-ups (Telegram Mini App, HMAC signing, direct-HTTP gateway integration).

## Telegram Mini App (v0.4 — Phase 2)

Same compose page, two modes — auto-detected via `window.Telegram?.WebApp?.initData`:

- **Standalone (Safari/desktop/saved file):** v0.3 behavior — FAB at bottom-left, HTTP POST to `/submit/<id>`.
- **Mini App (opened from inline `web_app` button in Telegram):** Telegram's native MainButton replaces the FAB, submit routes via `tg.sendData()` (signed). No per-template change anywhere — `tokens.css` reads `--tg-theme-*` vars with htmd defaults as fallbacks, and the compose bridge mirrors `tg.themeParams` onto `:root` at runtime.

Wiring:
- `htmd compose --serve` prints the public Mini App URL when `HTMD_MINI_APP_BASE` is set.
- `htmd button --url <mini-app-url>` emits the inline-keyboard chat envelope.
- `htmd serve`'s new `POST /tg-webhook` unwraps `update.message.web_app_data` and dispatches via `deliverSubmission()`.
- `scripts/openclaw-webappdata-hook.mjs` is the standalone alternative for OpenClaw setups that prefer not to use webhooks.

See `docs/MINI_APP_SETUP.md` for the one-time Tailscale + BotFather setup and the end-to-end test plan.

## What NOT to do

- Don't introduce a build step. Templates are shipped as source `.js`/`.css`/`.json`.
- Don't add chart libraries. The 4 inline-SVG charts in `src/chart.js` are intentionally minimal.
- Don't add a framework (React/Lit/JSX). The `html\`\`` tagged literal is the entire view layer.
- Don't add backend/state/auth. htmd outputs one HTML file. Period.
- Don't use external CDNs. Output must work offline and as an email attachment.

## Re-rendering examples

After any template change, regenerate `examples/<name>.html` so the gallery stays accurate:

```bash
for t in status-report dashboard decision-matrix comparison-3-up email-digest \
         slide-deck prompt-tuner kanban-board concept-explainer feedback-corrector \
         checklist q-and-a data-table; do
  node bin/htmd.js render "$t" --out "examples/$t.html"
done
```

(The render command falls back to the template's `example.yaml` when `--data` isn't given.)
