# Changelog

All notable changes to htmd. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project uses semver with `-alpha.N` / `-beta.N` prerelease tags.

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
