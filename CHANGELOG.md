# Changelog

All notable changes to htmd. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses semver with `-alpha.N` / `-beta.N` prerelease tags.

## [0.11.0-alpha.0] — 2026-05-20

Opt-in content-hash render cache. `htmd render --cache` (or the
library option `{ cache: true }`, or `cache.enabled: true` in
`htmd.config.json`) memoizes the rendered HTML on disk by SHA-256 of
its inputs. Off by default; nothing changes for callers that don't ask
for it. Determinism is preserved — see PHASE3_NOTES.md
§v0.11.0-alpha for locked decisions.

### Added
- **`htmd render --cache` CLI flag.** Opt-in. Companion flags:
  `--cache-dir <path>`, `--cache-ttl <ms>` (default 24h),
  `--cache-max-bytes <n>` (default 100MB). Environment overrides:
  `HTMD_CACHE_DIR`.
- **`renderTemplate(name, data, { cache: true })` library option.**
  Accepts `true` (defaults) or `{ enabled, dir, ttlMs, maxBytes }`.
  `enabled: false` disables the cache for that call.
- **`cache.*` keys in `htmd.config.json` / `~/.htmd/config.json`.**
  `cache.enabled`, `cache.dir`, `cache.ttlMs`, `cache.maxBytes`. CLI
  flags override config; config overrides built-in defaults.
- **`src/render-cache.js`** — the cache layer itself. ~170 LOC, no
  new dependencies. Filesystem-only (one HTML file per entry under
  the cache dir). Key = `SHA-256(canonical-JSON(template, template
  source hash, data, options, mode))`. Value = the exact rendered
  HTML bytes — no wrapper. Inline ~25-LOC canonical JSON serializer
  (sorted keys, dropped `undefined`, stable array order). Lazy TTL
  expiry on read; oldest-by-mtime eviction on insert when the
  directory would exceed the size cap.
- **`tests/render-cache.test.js`** — 30 cases covering canonical
  JSON determinism, key sensitivity to every input axis (template,
  template source, data, options, mode), TTL expiry, size-cap
  eviction, cache hit / miss correctness, and the two byte-parity
  invariants (cache hit ≡ cache miss; cache disabled ≡ cache enabled).
- **Public re-exports** from `src/index.js`: `defaultCacheDir`,
  `canonicalJson`, `computeCacheKey`, `templateSourceHash`.

### Changed
- Version bumped to `0.11.0-alpha.0`. `renderTemplate` now short-circuits
  to a cached entry before validating + rendering when the cache is
  enabled and the entry exists and is fresh. `renderTemplateParts`,
  `wrapShell`, and `renderMarkdown` are unchanged. Compose is unchanged
  (it goes through `renderTemplateParts`, which never touches the cache).

### Design decisions (locked)

1. **Off by default.** Same priority as v0.8.0 — the deterministic-CLI
   contract is the headline feature; adding silent state would change
   the contract for everybody to benefit a minority. Callers opt in
   per-process via CLI flag, per-call via library option, or per-repo
   via config.
2. **Hand-rolled canonical JSON, ~25 LOC.** No dependency. The
   serializer sorts object keys, drops `undefined`, and preserves
   array order. Sufficient for htmd's JSON-safe inputs (YAML-parsed
   data, scalar options). Non-finite numbers coerce to `null`.
3. **Cache value is the exact HTML bytes.** No metadata wrapper, no
   compression, no JSON envelope. The byte-parity invariants
   (`hit ≡ miss`, `disabled ≡ enabled`) collapse to "read returns
   what write wrote" and "the cached path takes whatever the
   uncached path produced." Tested.
4. **Cache key includes the template source hash.** A change to any
   of `render.js`, `style.css`, `script.js`, or `schema.json` for a
   template must invalidate that template's cached renders even when
   data + options are unchanged. Computed lazily inside the cache
   path; the existing `_cache` in `templates.js` means we only pay
   for it once per template per process.
5. **Cache key excludes `validate` and `cache` opts.** Including
   `validate` would make enabling validation a different cache key
   for the same output — false positive on the byte-parity invariant.
   Including `cache` itself would mean enabling the cache changes the
   key vs. disabled, which is the exact thing the invariant forbids.
   Only the options that actually shape the HTML (`title`, `lang`,
   `mode`) enter the key.
6. **Lazy TTL + lazy size eviction.** Reads check mtime; on a stale
   read we return a miss and the next write overwrites. Writes
   evict by mtime ascending until total + incoming fits under the
   cap. No background sweeper, no LRU package — just `fs` calls.
7. **Per-user, per-machine, last-writer-wins.** Two parallel htmd
   processes that compute the same key write the same bytes; the
   race resolves to "one of them wrote it last, and the bytes are
   identical." We do not lock.
8. **MCP `htmd_render` passes `cache` through unchanged.** No
   cache-aware tool, no MCP-only knobs. The MCP server stays stateless
   in the sense that v0.8.0 promised: state lives on disk and the
   tool call's effect on it is a pure function of the inputs.

### Known limitations
- The cache key has to load the template source to hash it. For a
  cache miss the cost is the same as the uncached path; for a hit we
  still pay one `readFileSync` of `render.js`. Acceptable — the file
  is tiny and the OS page cache absorbs it.
- The cache is filesystem-only and per-user. Two users on the same
  machine each get their own cache under `os.tmpdir()` (unless
  `HTMD_CACHE_DIR` is shared explicitly).
- Compose does not yet hit the cache. Each `htmd:`-fenced block
  routes through `renderTemplateParts`, which is the
  composition-friendly entry point; the cache lives one layer up at
  `renderTemplate`. Future v0.12 follow-up if useful.
- No metric / stat command surface. `htmd cache stats` / `htmd cache
  clear` are obvious follow-ups but not built — `rm -rf $HTMD_CACHE_DIR`
  is the workaround.

### Rough numbers
- Cold cache miss (single `htmd render status-report --cache …`):
  ~795 ms wall-clock. Warm cache hit: ~630 ms. ~20% reduction,
  dominated by Node startup and template loading. The actual render
  step is the slice the cache replaces; for larger / more data-heavy
  templates the gain is proportionally larger.

## [0.10.0-alpha.0] — 2026-05-20

Email-safe render mode. `htmd render --mode=email` produces a single
self-contained HTML document that survives Gmail and Outlook compose
windows: every CSS rule is inlined as a per-element `style` attribute,
every `var(--…)` reference is resolved to a literal, and every
`<script>`, `<style>`, and `<link>` tag is stripped. Web mode is
unchanged — the flag is purely additive. See PHASE3_NOTES.md
§v0.10.0-alpha for locked decisions and the inliner-choice rationale.

### Added
- **`htmd render --mode=email` CLI flag.** Default mode (`web`) is
  unchanged. `--mode=email` runs the rendered HTML through the new
  inliner before writing it out.
- **`renderTemplate(name, data, { mode: 'email' })` library option.**
  Mode-flagged only; an unknown mode throws.
- **`src/email-inliner.js`** — hand-rolled CSS inliner. Parses the
  embedded `<style>` block, expands `:root` custom properties (light
  mode only), matches rules against the parsed HTML tree by tag /
  class / id / multi-class / descendant / child / `:first-child` /
  `:last-child` / `:nth-child(N)` / `:first-of-type` / `:last-of-type`,
  applies declarations in specificity order, and writes them as inline
  `style` attributes. Unsupported selectors (`:hover`, `::before`,
  `+`, `~`) and `@media` / `@keyframes` / `@font-face` rules are
  dropped silently. Also resolves `var(--…)` expressions inside SVG
  attribute values (e.g. `fill="var(--htmd-accent, #4f46e5)"` becomes
  `fill="#4f46e5"`). ~500 LOC, no new dependencies.
- **MCP tool `htmd_render` gains a `mode` argument** with the same
  semantics as the CLI flag. Maps 1:1 to `htmd render --mode=…`; the
  `_debug.cli_equivalent` reflects the flag when set.
- **`tests/email-mode.test.js`** — 18 cases covering: per-template
  email-safe invariants (no script / link-stylesheet / style block /
  `var(--…)` residue) across status-report, dashboard, kanban-board,
  data-table, feedback-corrector, email-digest, pr-review;
  comparison-to-web-mode determinism; snapshot stability of
  status-report's email render across runs; low-level units for var()
  resolution, `@media` skipping, pseudo-element dropping, SVG
  attribute resolution, descendant/child/multi-class matching with
  correct specificity, and the HTML round-trip.

### Changed
- Version bumped to `0.10.0-alpha.0`. `wrapShell` is unchanged — the
  email pass runs on the already-wrapped HTML. No template, compose,
  serve, route, normalize, or transport-interface surface changed.

### Design decisions (locked)

1. **Hand-rolled inliner, not `juice` or `linkedom`.** `juice` pulls
   in cheerio + mensch + slick + web-resource-inliner; `linkedom`
   pulls in css-select + cssom + htmlparser2 + html-escaper. Both
   violate CLAUDE.md's no-frameworks rule. The hand-rolled inliner
   only handles the selector / CSS subset htmd templates emit; that
   subset is small and stable.
2. **Dark mode is the email client's job.** The
   `@media (prefers-color-scheme: dark)` block is parsed but its
   overrides are ignored. Only the light-mode `:root` values reach
   inline styles.
3. **Read-only by design.** Stripping `<script>` removes FAB,
   kanban-drag, form-submit, etc. Email is not a runtime for
   interaction.
4. **No table-based layout rewrite.** Outlook drops grid / flex; we
   pass them through unchanged. Adding pixel-perfect Outlook fallback
   is template-level work and explicitly out of scope for v0.10.0.

### Known limitations
- `::before` / `::after` decoration is dropped (no DOM target).
- `color-mix()` and `linear-gradient()` are preserved after `var()`
  resolution; Outlook desktop will drop them. Gmail / Apple Mail
  render correctly.
- The HTML parser handles htmd's own output (well-formed XHTML-ish);
  it is not a general-purpose HTML5 parser.

## [0.9.0-alpha.0] — 2026-05-20

Five new templates. All follow the existing `templates/<name>/`
structure (render.js + schema.json + style.css + optional script.js +
example.yaml + description.md) and reuse the established FAB / modal /
toast pattern for interactive submission. No new dependencies, no
build step, no external CDNs.

### Added

- **`code-diff`** — side-by-side/unified diff viewer. Computes hunks
  via LCS-based line diff at render time. Per-hunk accept/reject
  buttons aggregate decisions into a prompt copied back via the FAB.
  Simple regex tokenization for JS/TS and Python (no Prism /
  highlight.js — those are external libs).
- **`pr-review`** — list of changed files with per-file inline
  comment threads. Each comment has a "Mark resolved" toggle; changes
  (newly resolved + reopened) are aggregated into a prompt.
- **`form`** — generic schema-driven form. Supports `text`,
  `textarea`, `number`, `select`, `checkbox` (single or group),
  `radio`, `date`, `email`, and `url` fields. Required-field
  validation client-side; submission aggregated as a prompt.
- **`timeline`** — read-only vertical chronological event log with
  kind-based color coding (`info` / `success` / `warning` / `error` /
  `neutral`).
- **`network-graph`** — read-only node-edge SVG visualization. Layout
  is computed at render time with a hand-rolled force-directed
  algorithm (~40 LOC) seeded by a deterministic PRNG, so identical
  inputs produce identical layouts. Ships an accessible fallback
  node/edge table.

### Changed

- `src/templates.js` BUILTIN_NAMES extended with the five new
  templates so they are auto-discovered.
- `tests/render.test.js` ALL_TEMPLATES, INTERACTIVE_TEMPLATES, and
  STATEFUL lists extended to cover the new templates.

## [0.8.0-alpha.0] — 2026-05-20

htmd as MCP server. Lands a first-party Model Context Protocol server
that exposes the htmd CLI surface to any MCP-aware agent (Claude Code,
Claude Desktop, Cursor's MCP integration, Aider, …) as native tool
calls. One server replaces N adapters for harnesses that already speak
MCP. See PHASE3_NOTES.md §v0.8.0-alpha for locked decisions.

### Added
- **`htmd mcp` CLI subcommand** starts the htmd MCP server on stdio.
  Runs until stdin closes; logs a single ready banner to stderr.
- **`src/mcp-server/`** — hand-rolled JSON-RPC 2.0 over newline-
  delimited stdio (`protocol.js`), eight MCP tools each wrapping the
  same exported function the CLI calls (`tools.js`), and a stateless
  request handler (`index.js`). ~400 LOC total.
- Eight MCP tools, all 1:1 with existing CLI subcommands:
  - `htmd_render` → `renderTemplate()`
  - `htmd_compose` → `composeFromMarkdown()`
  - `htmd_route` → `route()` (decision only — no transport publish)
  - `htmd_normalize` → `normalize()`
  - `htmd_detect` → `detectTemplates()`
  - `htmd_extract` → `extractState()`
  - `htmd_templates` → `listTemplates()`
  - `htmd_schema` → `loadTemplate().schema`

  Every successful tool response carries `_debug.cli_equivalent` — a
  shell-quoted reproduction of the equivalent `htmd <subcommand>` call.
  Users can always reproduce a tool call on the shell.
- Tests: `tests/mcp-server.test.js` (27 cases) covering byte-identical
  output vs. the direct function call for every tool, statelessness
  (same args → same bytes across calls), error envelopes (missing
  args, schema-validation failure, invalid YAML), the JSON-RPC
  protocol layer (initialize, tools/list, tools/call, ping,
  notifications, unknown methods, parse errors), and a full stdio
  integration test against `PassThrough` streams.
- `docs/ADAPTERS.md` gains a "htmd MCP server" section documenting
  the wiring config for MCP clients and the design contract.
- `docs/PHASE3_NOTES.md` captures the v0.8.0-alpha locked decisions:
  thin-wrapper / stateless / 1:1-with-CLI / cli_equivalent in every
  response, plus the SDK-choice rationale.

### Changed
- Version bumped to `0.8.0-alpha.0`. No template, compose, serve,
  normalize, route, or transport-interface surface changed. The MCP
  server is purely additive.

### Design decisions (locked)

1. **Thin wrapper, not parallel implementation.** Each MCP tool calls
   the same exported function the CLI calls. No reimplementation.
2. **Stateless.** Zero cache / session / persistence. Same input →
   same output, every call.
3. **1:1 with CLI subcommands.** No MCP-only tools, no convenience
   wrappers without a shell-command counterpart.
4. **Every response carries `_debug.cli_equivalent`.** Users can
   reproduce any tool call on the shell.

These four rules preserve htmd's "deterministic CLI, no backend"
principle (CLAUDE.md). MCP is one more transport, not a fork.

### SDK choice
- **Hand-rolled JSON-RPC over stdio**, not `@modelcontextprotocol/sdk`.
  The official SDK pulls in `@hono/node-server`, `express`, `hono`,
  `jose`, `cors`, `pkce-challenge`, `eventsource`, `zod`,
  `zod-to-json-schema`, and ~6 other deps — a clear violation of
  htmd's "no frameworks" rule. The stdio MCP wire protocol is
  newline-delimited JSON-RPC 2.0; the implementation is ~80 lines for
  the dispatch loop and ~200 for the tool registry. No new
  dependencies added in v0.8.0-alpha.

### Known limitations
- The MCP server does not publish routed pages. `htmd_route` returns
  just the decision; rendering + publishing requires the host's serve
  daemon and transport credentials. Use the adapter pattern when you
  need publishing.
- No streaming. Each tool call is a single request → single response.
- The `cowork-mcp` and `cursor` transports' `_deliver` stubs (locked
  in v0.5.0-beta and v0.7.0-alpha) are unchanged. The htmd MCP server
  is the *agent → htmd* direction; the transport stubs are the
  *htmd → harness* direction. They will share a process eventually
  but v0.8.0 lands only the inbound direction.

## [0.7.0-alpha.0] — 2026-05-19

Third Phase 3 transport: Cursor IDE. Lands the adapter shape and
contract-validation milestone described in PHASE3_PLAN.md §v0.7.0.
The transport interface defined in v0.5.0-alpha now holds across
three adapters (openclaw-telegram, cowork-mcp, cursor) without any
refactor.

### Added
- **`cursor` transport** in `src/transports/cursor.js`. Targets
  Cursor IDE chat sessions. Publish writes the rendered page locally
  via the shared `serve-helpers.publishRender` pipeline; deliver
  routes submissions through one of three pluggable modes:
  - `file` (default) — appends newline-JSON to
    `~/.htmd/cursor/inbox.jsonl` for a sidecar to replay.
  - `http` — POSTs `{ id, sessionId, workspace, action, payload }`
    to `HTMD_CURSOR_MCP_URL`. Stand-in for the eventual htmd MCP
    server (v0.8.0) control surface.
  - `noop` — log + ok; smoke test.

  Cursor's MCP wire is not yet integrated (the htmd MCP server lands
  in v0.8.0); the transport defines a clean `_deliver` call site so
  the real MCP invocation drops in without touching the transport
  contract. `createCursorTransport()` accepts `_deliver` /
  `_publishRender` overrides for tests and future wiring.

  Publish envelope adds `cursorSession` and `cursorWorkspace` so
  the harness can address submissions back to the right Cursor
  chat / project window. Both are sourced from `meta.cursorSessionId`
  / `meta.cursorWorkspace`, then `HTMD_CURSOR_SESSION_ID` /
  `HTMD_CURSOR_WORKSPACE` env vars.
- Reference Stop-hook adapter for Cursor at
  `examples/adapters/cursor-stop-hook.mjs`. Differs from the cowork
  adapter only in the transport default and the `transport=cursor`
  tag on the page-control line — same shape the v0.5.0-beta
  acceptance criterion validated against cowork.
- `docs/ADAPTERS.md` gains a "Cursor adapter" section and notes that
  three adapters now share the `[[htmd:page transport=… …]]` control
  line; harnesses can dispatch on the `transport` tag.

### Changed
- Version bumped to `0.7.0-alpha.0`. No transport-interface refactor;
  the alpha contract held without modification across the third
  transport. No template, compose, serve, normalize, or route
  surface changed.

### Known limitations
- Cursor MCP delivery is stubbed pending the v0.8.0 htmd MCP server.
  The transport contract above the stub is stable; the wire is the
  one moving piece.
- Cursor does not yet have a documented Stop-hook contract. The
  reference adapter is shaped like the OpenClaw and cowork adapters
  for symmetry; the wiring point inside Cursor (extension manifest
  vs. CLI wrapper vs. sidecar) firms up once the MCP server lands.

## [0.6.0-alpha.0] — 2026-05-19

Agent-side intent metadata. Removes the harness adapter's need to
sniff intent from message content — the agent declares routing
intent inline and `htmd normalize` strips + surfaces it.

### Added
- **Metadata extraction in `src/normalize.js`.** Two source forms,
  both stripped from canonical output:
  - HTML comment: `<!-- htmd: needs-approval -->`,
    `<!-- htmd: priority=high -->`, or compound
    `<!-- htmd: needs-approval; priority=high -->`.
  - Fenced block:
    ` ```htmd-meta\nneeds-approval: true\npriority: high\n``` `.
  Values coerce to bool / int / float / quoted-string; bare
  directives become `true`. Hand-rolled mini-parser, no YAML
  dependency.
- New `metadata` field on the `normalize()` return object (always
  defined, `{}` when no directives are present).
- New `extractMetadata()` export for callers that want to run the
  extractor against already-Markdown input.
- **`src/route.js` consumes metadata directives.** Maps the well-
  known keys to the existing routing rules and OR-s them with CLI
  flags:
  - `inline-only: true` → rule 1 (`prefer-inline`, inline).
  - `needs-approval: true` → rule 2 (page,
    `reason: intent:needs-approval`).
  - `prefer-page: true` → rule 3 (page, `reason: prefer-page`).
  Annotation-only directives (e.g. `priority: high`) and unknown
  directives pass through unchanged on `decision.metadata`.
- `htmd route` CLI threads `norm.metadata` into the router so
  agent-emitted directives reach the rule pipeline without any
  flag plumbing on the harness side.
- Docs: PHASE3_DESIGN.md gains an "Agent-side intent metadata"
  section with the formal grammar + router behavior table.
  PHASE3_NOTES.md captures the v0.6.0-alpha decisions.

### Changed
- Version bumped to `0.6.0-alpha.0`. No template, compose, serve,
  or transport surface changed. The transport contract is
  unchanged — metadata only affects router decisions.

### Known limitations
- HTML comments in Telegram-flavored HTML input are stripped by
  turndown before metadata extraction runs. Agents emitting
  metadata should emit Markdown (the typical path). The fenced
  form survives turndown.
- Metadata-looking content inside an ordinary (untagged) fenced
  code block is intentionally not extracted. The fence info-string
  must be exactly `htmd-meta`.

## [0.5.0-beta.0] — 2026-05-19

Second Phase 3 transport. Validates that the v0.5.0-alpha transport
contract isn't OpenClaw-shaped by hand.

### Added
- **`cowork-mcp` transport** in `src/transports/cowork-mcp.js`. Targets
  Anthropic Cowork sessions via the cowork-mcp surface. Publishes
  renders locally via the shared `serve-helpers.publishRender` pipeline
  and delivers submissions via one of three modes:
  - `file` (default) — appends newline-JSON to
    `~/.htmd/cowork/inbox.jsonl` for a sidecar to replay.
  - `http` — POSTs `{ id, sessionId, action, payload }` to
    `HTMD_COWORK_MCP_URL` (stand-in for the eventual MCP control call).
  - `noop` — log + ok; smoke test.

  The Cowork MCP wire format is not yet public (2026-05-19); the
  transport defines a clean `_deliver` call site so the real MCP
  invocation drops in without touching the transport contract.
  `createCoworkMcpTransport()` accepts `_deliver` / `_publishRender`
  overrides for tests and future wiring.
- Reference Stop-hook adapter for Claude Code / Desktop cowork at
  `examples/adapters/cowork-stop-hook.mjs`. Identical to the OpenClaw
  adapter modulo two lines (transport default + control-line tag) —
  by design.
- `docs/ADAPTERS.md` expanded with a "writing a new adapter" walkthrough
  that uses cowork-mcp as the worked example.

### Changed
- Version bumped to `0.5.0-beta.0`. No transport-interface refactor —
  the alpha contract (`HtmdTransport` shape: `publish` returns an
  envelope, `deliver` returns `{ ok, detail? }`) held without
  modification across both transports. Plan budgeted for an
  "inevitable refactor"; we got lucky.

### Known limitations
- Cowork MCP delivery is stubbed pending public spec. The transport
  contract above the stub is stable.
- Streaming partial renders remain out of scope for v0.5.

## [0.5.0-alpha.0] — 2026-05-12

First alpha of Phase 3: per-turn routing + transport contract. See
[`docs/PHASE3_DESIGN.md`](./docs/PHASE3_DESIGN.md) for the full design.

### Added
- `htmd normalize` — CLI + library. Canonicalizes agent output
  (Markdown, Telegram-flavored HTML, or plain text) to CommonMark.
  Covers the 2026-05-12 regression where literal `<code>v0.4.0</code>`
  tags hit chat as escaped characters.
- `htmd route` — CLI + library. Deterministic 6-rule router that
  decides inline vs. page per outbound assistant message. Emits a
  stable JSON envelope.
- Layered config loader (`src/config.js`): env vars > per-repo
  `htmd.config.json` (walked up from cwd) > `~/.htmd/config.json` >
  built-in defaults.
- Transport interface in `src/transports/registry.js` plus two
  reference transports:
  - `stdio` — writes renders locally, appends reply JSON to
    `~/.htmd/replies/stdio.jsonl`.
  - `openclaw-telegram` — thin shim over today's
    `serve.publishRender` + `deliverSubmission`. Returns a Telegram
    inline-keyboard `web_app` envelope for the harness to publish.
- `htmd route --render --transport <name>` end-to-end flow with the
  v0.5.0-alpha fallback contract: on `transport.publish()` failure,
  the router returns `action: "inline"`, `reason: "transport-failure"`,
  and an `inlinePrefix` of `(htmd page failed: <reason>)`.
- Reference Stop-hook adapter for OpenClaw at
  `examples/adapters/openclaw-stop-hook.mjs` and a new
  [`docs/ADAPTERS.md`](./docs/ADAPTERS.md).
- `docs/PHASE3_NOTES.md` capturing locked-in decisions.

### Changed
- Version bumped to `0.5.0-alpha.0`. No template, compose, or serve
  surface changed; Phase 3 is additive.

### Known limitations
- Routing is deterministic only. No content classifier in alpha.
- Cowork-mcp transport + adapter land in v0.5.0-beta.
- Streaming partial renders remain out of scope for v0.5.

## [0.4.0] — 2026-05-12 (Phase 2: Telegram Mini App)
- Mini App hosting + receiving (h2/b2/b3/d1).
- See git history for details.

## [0.3.0] — earlier
- `htmd serve` + `--serve` flag + send-to-agent button (Phase 1).

## [0.2.0] — earlier
- Bidirectional MD↔HTML: compose / detect / extract; 9 templates.
