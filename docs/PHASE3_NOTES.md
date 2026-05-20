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

## Decisions locked for v0.8.0-alpha (2026-05-20)

| Topic | Decision |
|---|---|
| Server scope | htmd MCP server is a **thin wrapper over the existing CLI code path**, not a parallel implementation. Every MCP tool maps 1:1 to an existing CLI subcommand; every tool internally calls the same exported function (`renderTemplate`, `composeFromMarkdown`, `route`, `normalize`, `detectTemplates`, `extractState`, `listTemplates`, `loadTemplate`) the CLI calls. No MCP-only features, no convenience tools, no parallel impl. |
| Statelessness | **Zero state across calls.** No cache, no session, no persistence, no per-client memory. Each `tools/call` is independent. Same input → same output, every time. This preserves htmd's deterministic-CLI contract. |
| CLI reproducibility | **Every successful tool response carries `_debug.cli_equivalent`** — a shell-quoted invocation of the equivalent `htmd <subcommand>` call. Users can always reproduce a tool call on the shell. |
| Tool surface | Eight tools, all 1:1 with CLI subcommands: `htmd_render`, `htmd_compose`, `htmd_route`, `htmd_normalize`, `htmd_detect`, `htmd_extract`, `htmd_templates`, `htmd_schema`. Other CLI subcommands (`serve`, `button`, `preview`, `init-template`) are explicitly **not** exposed: they perform host-side I/O (start a daemon, open a browser, scaffold files) that doesn't fit a stateless MCP transport. |
| `htmd_route` scope | The MCP variant does **not** support the CLI's `--render --transport` mode — that requires host-side state (renders dir, serve daemon, transport credentials). MCP returns the decision; adapters still own publish. |
| SDK choice | **Hand-rolled JSON-RPC over stdio**, not `@modelcontextprotocol/sdk`. The official SDK pulls in `@hono/node-server`, `express`, `hono`, `jose`, `cors`, `pkce-challenge`, `eventsource`, `zod`, `zod-to-json-schema`, and ~6 other deps — a clear violation of htmd's "no frameworks" rule (CLAUDE.md). The stdio MCP wire protocol is newline-delimited JSON-RPC 2.0; the dispatch loop is ~80 lines, the tool layer is ~200. We accept the small maintenance burden of tracking the spec for the much larger benefit of keeping the dep tree minimal. |
| Protocol version | `2025-06-18`. Server advertises `capabilities.tools.listChanged = false` (tool list is fixed at build time; nothing changes at runtime). |
| Tool input schemas | JSON Schema (draft-07-ish, hand-authored). Aligns with how every other htmd template defines its inputs and avoids a Zod / `zod-to-json-schema` dep. |
| Tool response shape | Each tool returns a JSON object stringified into `content[0].text`. Successful: `{ ok: true, ...result, _debug: { cli_equivalent } }`. Failure: `{ ok: false, error, ...details }` plus `isError: true` on the outer MCP envelope. |
| Relationship to transports | `cowork-mcp` and `cursor` transports still stub their `_deliver` MCP wire (locked in v0.5.0-beta and v0.7.0-alpha respectively). The htmd MCP server is the *agent → htmd* direction; the transports' MCP wire is the *htmd → harness* direction. Both will eventually share the same MCP server process, but the v0.8.0 ship lands only the inbound direction. |
| Telegram user concern | Xuyang explicitly raised "doesn't this defeat htmd's deterministic-CLI design?" before scoping. The four constraints above (thin wrapper / stateless / 1:1 with CLI / cli_equivalent debug field) are the answer; they are tested in `tests/mcp-server.test.js` and enforced architecturally by the fact that every tool calls the same exported function the CLI calls. |

## Known limitations going into v0.8.0-alpha

- The MCP server doesn't publish routed pages. `htmd_route` returns
  just the decision; rendering + publishing a page requires the host's
  serve daemon + transport credentials. Use the adapter pattern when
  you need publishing.
- No streaming. Each tool call is a single request → single response.
- `htmd_render` accepts `data` (parsed object), `dataYaml`, or
  `dataJson` as inputs. The CLI's `--data <file>` path is reachable by
  reading the file on the agent side and passing the contents — file
  I/O stays in the client process, not the server.
- The hand-rolled JSON-RPC layer implements the minimum surface needed
  for `initialize`, `tools/list`, `tools/call`, `ping`, and
  `notifications/initialized`. If a future MCP feature (sampling,
  roots, prompts, resources) becomes interesting we'll add it; nothing
  in v0.8.0 needs it.
- Per the design constraint, the server holds no state. Clients that
  expect e.g. an "open render id" session must thread that state
  themselves via tool arguments.

## Decisions locked for v0.10.0-alpha (2026-05-20)

| Topic | Decision |
|---|---|
| New surface | `htmd render --mode=email` (CLI) and `renderTemplate(name, data, { mode: 'email' })` (lib). Web mode (`--mode=web`, default) is unchanged. MCP gets a `mode` argument on `htmd_render`. |
| Output guarantees | No `<script>`, no `<link rel="stylesheet">`, no `<style>` block (post-inlining), no `var(--…)` CSS expressions in the body. Single self-contained HTML document, safe to paste into a Gmail compose or attach to a `multipart/related` email. |
| Inliner choice | **Hand-rolled** (`src/email-inliner.js`, ~500 LOC). Considered `juice` (pulls in `cheerio`, `mensch`, `web-resource-inliner`, `slick`, `entities` — large transitive surface, against CLAUDE.md's "no frameworks") and `linkedom` (pulls in `css-select`, `cssom`, `htmlparser2`). The hand-rolled inliner handles only the subset htmd output actually uses: tag / class / id selectors with descendant + child combinators + multi-class, `:first-child` / `:last-child` / `:nth-child(N)`, and comma-separated lists. Unsupported selectors (`:hover`, `::before`, `*`, `+`, `~`) and `@media`-gated rules are dropped silently. The CSS-custom-property layer is resolved at render time against the `:root` block's light-mode values; nested `var()` chains and `var(--x, fallback)` syntax are honored. |
| Pseudo-element handling | `::before` / `::after` content rules are dropped — they produce no real DOM nodes that an inliner can target, and most email clients ignore them anyway. Templates that rely on `::before` for decorative content (e.g. `.sr-meta-owner::before { content: "by "; }`) lose the decoration in email mode; this is documented, not a bug. |
| Dark mode | Skipped in email mode. The `@media (prefers-color-scheme: dark)` block in `tokens.css` is parsed but its overrides are ignored; only the light-mode `:root` values are resolved into inline styles. Same rationale as Gmail / Outlook: dark mode is the client's job to invert. |
| Responsive media queries | `@media (max-width: ...)` rules are skipped. Email is delivered at a fixed width per client; templates' mobile layouts don't apply. |
| External fonts / images | No external `<link rel=…font…>` ever appears in htmd output (we use system fonts via `--htmd-font-sans`). External `<img src="https://…">` is rare across the existing templates; the inliner leaves any `<img>` tag intact (mail clients handle their own image policy) and just strips `<script>` and `<link>` wrapper tags. |
| Determinism | Email mode is deterministic. Same data + same template = byte-identical HTML. Snapshot-tested on `status-report` in `tests/email-mode.test.js`. |
| Templates marked interactive | In email mode, scripts are stripped — the FAB / kanban-drag / form-submit JS goes away. The HTML is read-only by design. No regression: web mode is unchanged. |

## Known limitations going into v0.10.0-alpha

- `::before` / `::after` decorations do not render in email mode (no DOM target for inline styles). Templates that depend on them for non-decorative content should add the same content as a regular element when possible.
- `color-mix()` and `linear-gradient()` are passed through as-is after `var()` resolution. Outlook desktop drops them; Gmail and Apple Mail handle them. Templates using gradients (`.sr-hero`) will fall back to the resolved background color in Outlook.
- The hand-rolled HTML parser handles the subset htmd templates actually emit (well-formed XHTML-ish output from the `html` tagged-template helper). It is not a general-purpose HTML5 parser. Passing arbitrary user HTML into `wrapShell` and then rendering in email mode is out of scope.
- Layout via CSS Grid / Flexbox is left intact (the inliner doesn't rewrite to tables). Outlook 2016+ ignores grid; Gmail and Apple Mail render correctly. Templates that need pixel-perfect Outlook rendering should add table-based fallbacks at the template level — out of scope for v0.10.0.

## Open follow-ups (not blockers for beta)

- Add `htmd route --explain` (debug rule trace). Punted from alpha;
  still useful, still punted.
- Schema validation for `htmd.config.json` (currently best-effort).
- Decide whether the `openclaw-telegram` SSH reply path should move
  into `htmd serve` once the transport contract stabilizes.
- Real cowork-mcp wire integration once the MCP spec lands.
- ~~htmd MCP server (v0.8.0).~~ **Shipped 2026-05-20.** Provides the
  `mcp` delivery mode the `cowork-mcp` and `cursor` transports defer
  to today; lands as a stdio module (`htmd mcp`) that MCP-aware
  harnesses launch as a child process. Inbound direction (agent →
  htmd tools) is the entire v0.8.0 surface. Outbound direction (htmd
  → harness submission delivery) is still stubbed in the transports
  and will swap in once the harness side speaks MCP back at the
  server.
