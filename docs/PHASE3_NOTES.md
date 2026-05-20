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

## Open follow-ups (not blockers for beta)

- Add `htmd route --explain` (debug rule trace). Punted from alpha;
  still useful, still punted.
- Schema validation for `htmd.config.json` (currently best-effort).
- Decide whether the `openclaw-telegram` SSH reply path should move
  into `htmd serve` once the transport contract stabilizes.
- Real cowork-mcp wire integration once the MCP spec lands.
