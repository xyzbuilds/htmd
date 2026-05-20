# htmd Phase 3 — running notes

Companion to [PHASE3_DESIGN.md](./PHASE3_DESIGN.md) and
[PHASE3_PLAN.md](./PHASE3_PLAN.md). Captures decisions, known
limitations, and gotchas as v0.5 ships.

## Decisions locked for v0.5.0-alpha (2026-05-12)

| Topic | Decision |
|---|---|
| Routing config | Layered: env > per-repo `htmd.config.json` > `~/.htmd/config.json` > built-ins |
| No-rule default | `inline` (reason: `below-thresholds`) |
| Length threshold | 1500 chars |
| Transport failure | Fall back to inline with `(htmd page failed: <reason>)` prefix; router reports `action: "inline"`, `reason: "transport-failure"` |
| OSS distribution | Stay at github.com/xyzbuilds/htmd |
| Agent intent metadata | Deferred to v0.6 |

## Known limitations going into alpha

- Routing is deterministic only. No content classifier.
- Reply path goes through `~/.htmd/replies/<transport>.jsonl` (stdio)
  or the existing OpenClaw SSH path (`openclaw-telegram`).
- Per-template routing overrides are not supported; routing decisions
  run on the wire format, not the template choice.

## Decisions locked for v0.5.0-beta (2026-05-19)

| Topic | Decision |
|---|---|
| Cowork MCP wire format | **Stubbed pending public spec.** The `cowork-mcp` transport defines a `_deliver` call site that the real MCP invocation drops into without changing the transport contract. Default delivery is file-drop (`~/.htmd/cowork/inbox.jsonl`) so a sidecar can tail and replay. |
| Default cowork delivery mode | `file`. Alternatives are `http` (stand-in via `HTMD_COWORK_MCP_URL`) and `noop` (smoke test). |
| Cowork session addressing | Submissions carry `sessionId`, sourced (in order): explicit `deliver()` arg → `HTMD_COWORK_SESSION_ID` env. `meta.coworkSessionId` populates the publish envelope so the harness can include it in any chat-side artifact. |
| Adapter control-line shape | Cowork emits `[[htmd:page transport=cowork-mcp id=… url=… submit=…]]`. OpenClaw stays at `[[htmd:page id=… url=… submit=…]]`. The `transport=` tag is the only adapter-visible difference between the two reference adapters — confirming v0.5.0-beta's "transport abstraction holds" claim. |
| Transport interface refactor | **None.** The cowork-mcp transport implemented cleanly against the v0.5.0-alpha `HtmdTransport` shape (`publish` → envelope, `deliver` → `{ ok, detail? }`) without any contract changes. The plan budgeted for an "inevitable refactor"; in practice the alpha contract held. |

## Known limitations going into beta

- Cowork MCP delivery is stubbed. Real wiring is one function swap
  inside `cowork-mcp.js` once the spec is public; the transport
  contract above it does not change.
- `cowork-mcp` `http` mode currently uses Node's global `fetch`. Tests
  exercise the call-site shape via the `_deliver` override rather than
  spinning up a real HTTP listener; if/when the real MCP control
  surface is wired, replace the `deliverViaHttp` body and add an
  integration test against a local stub.
- Per-transport routing is still not supported — routing decisions run
  on wire format, not the chosen transport. (No regression from alpha.)

## Decisions locked for v0.6.0-alpha (2026-05-19)

| Topic | Decision |
|---|---|
| Metadata source forms | Two: `<!-- htmd: ... -->` HTML comment and ` ```htmd-meta ` fenced block. Both are equally first-class; both are stripped from canonical output. |
| Fenced-block parser | Hand-rolled mini-parser. No YAML library dependency. One `key: value` per line, no nesting. `#`-prefixed lines are comments. Values coerce to bool / int / float / quoted-string; bare values pass through as string. |
| HTML-comment directives | One comment may carry multiple directives separated by `;`. A bare directive (no `=`) becomes `true`. |
| Surface on normalize result | New `metadata` field on the return object. Empty object `{}` when no directives present (always defined, never null). |
| Router precedence | Metadata-driven flags OR with CLI flags. Existing rule order holds — `inline-only` (rule 1) beats `needs-approval` (rule 2). CLI `--prefer-inline` and metadata `inline-only: true` collapse to the same rule. |
| Reason strings | Same reasons regardless of source (`prefer-inline`, `intent:needs-approval`, `prefer-page`). The `metadata` field on the decision tells the caller which directives fired. |
| Annotation directives | `priority: high` and other non-routing keys are passed through on `decision.metadata`. Transports may consult them (e.g. for delivery priority). |
| Unknown directives | Forward-compatible. Preserved on the metadata object verbatim. Router ignores keys it does not know. |
| Transport contract | **Unchanged.** Metadata only affects router decision; transports still receive the existing envelope. The plan budgeted for a possible contract change; we did not need one. |
| Telegram-HTML metadata | Known limitation: turndown strips HTML comments before metadata extraction runs. Agents emitting metadata should emit Markdown. Documented; not fixed in v0.6. |

## Known limitations going into v0.6.0-alpha

- Turndown strips HTML comments in the Telegram-HTML path, so
  `<!-- htmd: ... -->` directives that arrive via Telegram-HTML are
  lost before metadata extraction. The fenced form survives.
- Metadata extraction runs after format normalization. If the input
  is plain text, the comment / fence forms are recognized but the
  detected `format` still reports `plain` (not `markdown`) because
  format detection looks at the raw input.

## Decisions locked for v0.7.0-alpha (2026-05-19)

| Topic | Decision |
|---|---|
| Cursor transport name | `cursor` (not `cursor-mcp`). Cursor IDE is the addressed surface; `mcp` is one of several possible wire formats and the eventual primary one. Naming after the surface keeps the door open for non-MCP wire integrations (a Cursor extension HTTP listener, e.g.) without renaming. |
| Cursor delivery wire | **Stubbed pending v0.8.0 htmd MCP server.** Same `_deliver` pattern as cowork-mcp — defaults to file-drop (`~/.htmd/cursor/inbox.jsonl`), with `http` (stand-in for the eventual MCP control surface) and `noop` modes. The real MCP invocation drops into the `mcp` mode (or replaces `http`) without touching the transport contract. |
| Default cursor delivery mode | `file`. Mirrors cowork-mcp; lowest-friction smoke test path. |
| Cursor session addressing | Submissions carry `sessionId` + `workspace`. Sourced (in order): explicit `deliver()` arg → `HTMD_CURSOR_SESSION_ID` / `HTMD_CURSOR_WORKSPACE` env. `meta.cursorSessionId` and `meta.cursorWorkspace` populate the publish envelope so the harness can include them in chat-side artifacts. Workspace is a Cursor-specific addition over the cowork shape; the sidecar that replays the inbox needs both to route into the correct project window. |
| Adapter control-line shape | Cursor emits `[[htmd:page transport=cursor id=… url=… submit=…]]`. Three adapters now share the line shape; harnesses that consume the shape can dispatch on the `transport` tag. |
| Transport interface refactor | **None.** Cursor implemented cleanly against the v0.5.0-alpha `HtmdTransport` contract; the alpha shape now holds across three adapters (openclaw-telegram, cowork-mcp, cursor). |
| Relationship to v0.8.0 (htmd MCP server) | The `cursor` transport's `_deliver` call site is the integration point for the future htmd MCP server. When v0.8.0 lands, the change is one function swap inside `cursor.js` (and a parallel one in `cowork-mcp.js`). The transport name, envelope shape, and adapter remain stable. |

## Known limitations going into v0.7.0-alpha

- Cursor MCP delivery is stubbed pending the v0.8.0 htmd MCP server.
  The transport contract above the stub is stable; the `mcp` wire is
  the one moving piece.
- Cursor does not yet have a documented Stop-hook contract. The
  reference adapter is shaped like the OpenClaw and cowork adapters
  for symmetry, but the wiring point inside Cursor (extension manifest
  vs. CLI wrapper vs. sidecar) is harness-specific and will firm up
  once the MCP server lands.
- The `cursor` transport's `http` mode shares the same call-site
  caveat as cowork-mcp's: tests exercise the shape via `_deliver`
  override rather than spinning a real HTTP listener. Replace
  `deliverViaHttp` (or add an `mcp` mode) when wiring the real MCP
  control surface.

## Open follow-ups (not blockers for beta)

- Add `htmd route --explain` (debug rule trace). Punted from alpha;
  still useful, still punted.
- Schema validation for `htmd.config.json` (currently best-effort).
- Decide whether the `openclaw-telegram` SSH reply path should move
  into `htmd serve` once the transport contract stabilizes.
- Real cowork-mcp wire integration once the MCP spec lands.
- htmd MCP server (v0.8.0). Provides the `mcp` delivery mode that
  both `cowork-mcp` and `cursor` transports defer to today. Lands as
  a standalone module that Cursor (and other MCP-aware harnesses)
  launch as a child process over stdio.
