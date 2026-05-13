# htmd Phase 3 — implementation plan

Companion to [PHASE3_DESIGN.md](./PHASE3_DESIGN.md). Read that first.

Drafted 2026-05-12. Subject to revision once v0.5.0-alpha is in hand.

## Milestones

### v0.5.0-alpha — routing core + one real adapter (target: ~2 days)

Goal: end-to-end working pipeline against the OpenClaw + Telegram path,
with the routing logic in htmd core rather than in OpenClaw.

Ships:

1. **`htmd normalize`** — CLI + library. Accepts Markdown, Telegram-HTML,
   or plain text; emits canonical CommonMark. Tests:
   `tests/normalize.test.js` covering the three inputs and the
   `<code>v0.4.0</code>` regression case from the 2026-05-12 incident.
2. **`htmd route`** — CLI + library. Implements the 6 v1 rules from
   the design doc. JSON output as specified. Tests:
   `tests/route.test.js` covering each rule plus precedence
   (`--prefer-inline` overrides `--needs-approval`).
3. **Transport interface** in `src/transports/index.js`. Exports the
   `HtmdTransport` shape (JSDoc + types for downstream TS consumers if
   we want them later) plus a registry (`registerTransport`,
   `getTransport`).
4. **`stdio` transport** in `src/transports/stdio.js`. Reference
   implementation; minimal — writes renders + appends JSON lines to a
   reply FIFO.
5. **`openclaw-telegram` transport** in `src/transports/openclaw-telegram.js`.
   Wraps the existing `serve.js` Telegram delivery + the SSH-into-OpenClaw
   reply path. **Crucially, this is a thin shim over today's logic, not
   a rewrite** — proves the abstraction without breaking v0.4.
6. **`htmd route --render --transport <name>`** end-to-end flow.
7. **Reference adapter for OpenClaw** in `examples/adapters/openclaw-stop-hook.mjs`.
   ~20 lines. Documented in `docs/ADAPTERS.md` (new).
8. **CHANGELOG.md entry** + version bump to 0.5.0-alpha.0.

Acceptance test (manual):

- An OpenClaw agent reply containing a 3000-char plan with a Markdown
  table goes through the Stop-hook → `htmd route` → `action: "page"` →
  Telegram message is an inline-keyboard button → user taps → page
  loads → user submits → OpenClaw inbox sees the submission.
- An OpenClaw agent reply with "Got it, will fix" goes through the
  same hook → `action: "inline"` → unchanged delivery to Telegram.

### v0.5.0-beta — second adapter validates the abstraction (target: ~2 days)

Goal: prove the transport interface isn't OpenClaw-shaped by hand.

Ships:

1. **`cowork-mcp` transport** in `src/transports/cowork-mcp.js`.
   Publishes renders locally, delivers submissions via Claude Code's
   MCP control surface so cowork sessions get the user reply as a
   regular user turn.
2. **Reference adapter for Claude Code / Desktop cowork** in
   `examples/adapters/cowork-stop-hook.mjs`.
3. **Inevitable refactor of the transport interface** based on what
   the cowork integration teaches us. (If we don't end up refactoring,
   we got lucky; if we refactor significantly, the abstraction
   wasn't ready in alpha — that's the point of doing two adapters.)
4. **`docs/ADAPTERS.md` expanded** with a "writing a new adapter"
   walkthrough that uses cowork as the example.
5. Version bump to 0.5.0-beta.0.

Acceptance test (manual):

- A Claude Code session in cowork mode produces a long reply → htmd
  page opens locally → user edits → submission flows back into the
  cowork session as a regular user message.

### v0.5.0 — stable (target: after beta soak)

Ships:

1. Soak period: 3-5 days of daily-driver use across both adapters with
   no transport-interface changes.
2. Documentation polish: top-level README "routing" section, AGENT_USAGE.md
   addendum, SKILL.md updated with the new intent flags.
3. Version bump to 0.5.0.

### v0.6.0 — agent-side intent metadata (deferred, sketched only)

Idea: agents emit `<!-- htmd: needs-approval -->` (or fenced metadata
blocks) inside their replies. `htmd normalize` strips and surfaces them
as flags to the router. Removes the harness adapter's need to sniff
intent from message content.

### v0.7.0 — third adapter (VS Code or Cursor)

Goal: VS Code extension + transport that lets an IDE-embedded agent
use htmd. Adapter authorship is "real plugin work" (extension manifest,
activation events, localhost HTTP listener) — keep it scoped.

### Future — hosted variant

`htmd-transport-hosted` plus a remote htmd service (auth, audit,
review queues). Becomes a real product. Out of v0.5/0.6/0.7 scope but
the transport contract is designed not to preclude it.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Transport interface ossifies around OpenClaw before second adapter exists | Build cowork transport immediately after alpha; willing to break the alpha interface |
| `htmd route` becomes a feature-creep magnet (people will want "smart" routing) | Keep the 6-rule contract documented; reject smart-routing PRs that aren't deterministic |
| Adapter authorship turns out hard for IDE-embedded agents | Defer VS Code adapter past v0.5; ship stdio + openclaw + cowork first |
| Fallback behavior when transport fails is wrong | Document the rule: transport failure → fall back to inline with prefix `(htmd page failed: …)`. Test it. |
| Routing decisions become hard to predict for the user | Add `htmd route --explain` that prints the rule path that fired |

## What we are explicitly not doing in Phase 3

- Streaming partial renders.
- Multi-tenant / cloud / auth.
- ML-based content classification.
- Replacing `htmd compose` or any v0.4 surface.
- Per-template routing rules (a template author can't override; the
  router runs on the wire format).

## Tracking

- Design doc: [PHASE3_DESIGN.md](./PHASE3_DESIGN.md).
- This plan: this file.
- Per-milestone NOTES: keep using the `NOTES.md` pattern (`PHASE3_NOTES.md`
  after the first ship) to capture decisions + known limitations.
- Cross-machine continuity: this repo is the source of truth; Mac
  Studio pulls from `macstudio` remote, dev machines from `origin`.
  No design state lives outside the repo.
