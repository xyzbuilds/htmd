# Changelog

All notable changes to htmd. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses semver with `-alpha.N` / `-beta.N` prerelease tags.

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
