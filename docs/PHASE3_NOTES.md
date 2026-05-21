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

## Decisions locked for v0.12.0-alpha (2026-05-20)

| Topic | Decision |
|---|---|
| New surface | `webhook` transport — generic HTTP-POST delivery for any harness that doesn't warrant a dedicated transport file. Registers under `transports.webhook` in the config tree; opt in by selecting `--transport webhook` on the route call. |
| Wire shape | Single URL receives both `publish` and `deliver` POSTs. Body is `{ op: 'publish', slug, renderedHtml, markdown, meta }` or `{ op: 'deliver', id, action, payload }`. The `op` discriminator keeps the receiver simple (one route, switch on `op`) and matches the symmetry of the in-process transport contract. |
| Response shape | **Publish:** 2xx JSON body must include `{ id, url, submitEndpoint }`; extras are spread through to the adapter. Missing required fields → `webhook-invalid-response` (router falls back to inline). **Deliver:** status code is the contract; 2xx → `{ ok: true }`, otherwise `{ ok: false, reason: webhook-<4xx\|5xx\|timeout\|error> }`. Asymmetric on purpose: publish failures need to flow through `applyDecision`'s fallback (catches exceptions), deliver returns its outcome to the caller. |
| Retries | Implemented as a simple for-loop in `postWithRetries`, no library. **5xx + network errors retry** up to `retries` extra attempts (default `0`). **4xx and timeout do not retry** — 4xx is a contract failure on the receiver side, timeout means the budget was already given. Backoff is linear 50ms × attempt; tests inject a no-op sleep. |
| Timeout | Implemented via `AbortController` around the `fetch` call. Default 10000ms. Triggers `webhook-timeout`, never retried. |
| HTTP layer | Node 18+ global `fetch` only. No `axios`, `got`, `node-fetch`. No keep-alive pool, no connection cache — each POST is independent. Matches CLAUDE.md's "no frameworks" rule. |
| Config | Layered like the rest of htmd: explicit constructor opts > env (`HTMD_WEBHOOK_URL`, `HTMD_WEBHOOK_HEADERS`, `HTMD_WEBHOOK_TIMEOUT_MS`, `HTMD_WEBHOOK_RETRIES`) > `transports.webhook.*` in `htmd.config.json` / `~/.htmd/config.json` > built-in defaults. `HTMD_WEBHOOK_HEADERS` parses as a JSON object; invalid JSON falls through to other layers. |
| Transport contract | **Unchanged.** Webhook implemented cleanly against the v0.5.0-alpha `HtmdTransport` shape. Four transports now ride the same contract (stdio, openclaw-telegram, cowork-mcp, cursor, webhook = five total). |
| MCP integration | None. The brief specifically excluded adding a new MCP tool for webhook — `htmd_route` continues to flow through `applyDecision` which dispatches via the transport registry. The webhook transport reuses the existing path. |
| Reference adapter | `examples/adapters/webhook-curl.sh` — bash + `jq`, ~70 lines. The first non-Node adapter in the directory; proves the adapter pattern doesn't require a Node hook. |
| Tests | `tests/webhook.test.js` — 20 cases against a local `http.createServer` (no real URLs). Covers: registry shape, publish success path with envelope/header round-trip, 4xx no-retry, 5xx exhausts retries, 5xx-then-2xx within budget, timeout no-retry, missing-URL config error, deliver success, deliver 4xx/5xx/timeout/config-missing, env-vs-explicit precedence, and end-to-end through `applyDecision` for both success and the inline fallback. |

## Known limitations going into v0.12.0-alpha

- Single URL serves both `publish` and `deliver`. The receiver must
  switch on the `op` field. If a future receiver needs different URLs
  per op, a `transports.webhook.deliverUrl` override is a v0.13
  follow-up — the current shape is intentionally minimal.
- No request signing / HMAC. The `headers` option lets you ship a
  bearer token, which is sufficient for HTTPS-only receivers. HMAC
  signing of the body (the v0.4 deferred follow-up) still applies; if
  added, it slots in at the same layer for all transports, not just
  webhook.
- Linear 50ms-step backoff is deliberately small. The brief asked for
  "simple loop + setTimeout"; exponential backoff with jitter is a
  v0.13 candidate if real-world receivers fail repeatedly in ways the
  current scheme can't smooth over.
- The transport does not currently verify the response `Content-Type`
  is JSON; it tries `JSON.parse` and falls back to `{}` on a parse
  error. A non-JSON 2xx response will surface as
  `webhook-invalid-response` because `id`/`url`/`submitEndpoint` will
  be missing.

## Decisions locked for v0.11.0-alpha (2026-05-20)

| Topic | Decision |
|---|---|
| New surface | `htmd render --cache` (CLI) + companions (`--cache-dir`, `--cache-ttl`, `--cache-max-bytes`); `renderTemplate(name, data, { cache: true | { dir, ttlMs, maxBytes, enabled } })` (lib); `cache.*` keys in `htmd.config.json` / `~/.htmd/config.json`. `HTMD_CACHE_DIR` env override. **Off by default.** |
| Default state | Disabled. The deterministic CLI contract is the headline feature; adding implicit on-disk state would change the contract for every caller for the benefit of a minority. Opt-in only. |
| Cache key | `SHA-256( canonical-JSON( { template, templateHash, data, options, mode } ) )`. `templateHash` = hash of `render.js` + `style.css` + `script.js` + `schema.json`. `options` is restricted to the keys that actually shape the HTML output (`title`, `lang`); `validate`, `cache`, and any other knob that does not change output bytes is excluded. |
| Canonical serializer | **Inline, ~25 LOC** in `src/render-cache.js`. Sorts object keys; preserves array order; drops `undefined`; coerces non-finite numbers to `null`. No dep. Sufficient for htmd's JSON-safe data + scalar options. |
| Cache value | The exact rendered HTML bytes — no metadata wrapper, no compression, no JSON envelope. The two byte-parity invariants (cache hit ≡ cache miss; cache disabled ≡ cache enabled) reduce to "the cached path doesn't transform the output." |
| Storage location | One HTML file per entry under `os.tmpdir() + '/htmd-cache/'` by default. Overridable via `HTMD_CACHE_DIR` env, `cache.dir` config, or `--cache-dir` flag (highest precedence). Per-user, per-machine. |
| TTL | Default 24h. Lazy: on read, if `Date.now() - mtimeMs > ttlMs`, return miss. The next write overwrites the stale entry. No background sweeper. |
| Size cap | Default 100MB. On write, if total directory size + incoming > cap, evict oldest entries by `mtime` ascending until the new entry fits. No LRU package — just `readdir + stat + unlink`. |
| Concurrency | None. Two processes that compute the same key write the same bytes; last-writer-wins is fine because the bytes are identical by construction. No locks. |
| MCP integration | `htmd_render` passes the `cache` option through unchanged. No MCP-only cache knobs. The server's "stateless across calls" promise is preserved in the sense that v0.8.0 meant it: state lives on disk, and the tool call's effect on it is a pure function of the inputs. |
| Compose | Does not hit the cache today. Compose blocks route through `renderTemplateParts`, which is the composition-friendly entry point; the cache lives one layer up at `renderTemplate`. Future v0.12 follow-up if measured to matter. |
| Verification | `tests/render-cache.test.js` — 30 cases. The two byte-parity invariants are the hardest constraint; everything else (key sensitivity per axis, TTL, eviction) is mechanical. Poisoned-value test proves hits skip the renderer; rewritten-content test proves expired entries re-render. |

## Known limitations going into v0.11.0-alpha

- The cache layer reads `render.js` once per cache check to compute the template source hash. For a cache miss the cost is the same as the uncached path; for a hit there is one extra `readFileSync` of a small file. Page cache absorbs it.
- Compose is uncached. The unit of caching is `renderTemplate`, not `renderTemplateParts`. Composed pages mixing prose + multiple templates always re-render today.
- No `htmd cache stats` / `htmd cache clear` subcommand. `rm -rf $HTMD_CACHE_DIR` (or `~/.htmd-cache`, or `os.tmpdir()/htmd-cache`) is the manual workaround.
- Two-user collisions on the same machine are possible only if `HTMD_CACHE_DIR` is deliberately shared. The default per-user `os.tmpdir()` avoids them.
- The cache only memoizes the final output of `renderTemplate`. Schema validation still runs on the live data before any hit / miss is consulted? — **no, it does not.** A cache hit short-circuits before validation, which is correct (the cached value was produced by validated inputs). If you change the schema without changing the rest of the template, the `templateHash` invalidates the entry anyway.

## Decisions locked for v0.13.0-alpha (2026-05-21)

`htmd lint <file.md>` — pre-render validation pass for Markdown files
with embedded htmd fences. Last queued autonomous phase; further
phases need Xuyang's input.

| Topic | Decision |
|---|---|
| Subcommand surface | `htmd lint <file.md>` (or `-` for stdin). New MCP tool `htmd_lint` wraps the same exported `lintMarkdown(md, { filePath })` — 1:1 with the CLI, same constraint stack v0.8.0 locked. |
| Exit codes | `0` clean, `1` lint errors, `2` unreadable / IO error. Mirrors common linters; `1` is the actionable bucket so CI can gate on it. |
| Rule set | `unknown-template`, `parse-error`, `schema-error`, `unclosed-fence`, `nested-htmd`, `meta-bad-key`, `meta-bad-value`, `meta-unknown-directive`. Errors and warnings are separately reported but only errors influence the exit code — warnings are reserved for forward-compatible passes (e.g. unknown htmd-meta directives, which the router preserves verbatim per v0.6.0). |
| Reuses, does not reimplement | The lint engine reuses `listTemplates()`, `loadTemplate()`, and `schema.validate()`. The fence scanner is local (~30 LOC) — neither `marked` nor `compose.parseSegments` exposes the open-fence-but-no-close location info lint needs. The htmd-meta value coercion mirrors `src/normalize.js` `parseValue` exactly so lint reports what the router will actually see. |
| Schema validation source | Each template's `schema.json`, when present, via the existing `ajv` wrapper. No new dependencies. Templates without a schema are validated only for parseability. |
| Nested-fence detection | A 4-backtick outer fence with a 3-backtick `htmd:*` inside is the surfaceable case. The scanner only walks top-level fences; nested htmd opens are detected by line-scanning the body for `^\s{0,3}\`{3,}\s*htmd[:\s]`. Lint reports the inner location, not the outer. |
| Error location surfacing | Every issue carries `{ file, line, col }`. Lines are 1-based; columns 1-based. Body-level errors point to the first body line (where YAML / schema errors first manifest); fence-level errors point to the open fence line. |
| Output formats | `--format=text` (default, one `file:line:col: severity[rule]: message` line per issue) and `--format=json` (`{ errors: [...], warnings: [...] }`). Snapshot tests pin the JSON shape. |
| No new dependencies | Same constraint as every phase since v0.5: hand-rolled scanner, reuse ajv + yaml that the rest of htmd already pulls in. |
| What lint does NOT do | No autofix. No "would render successfully" assertion (validation matches the render path's pre-render checks; runtime template errors that depend on data shape beyond the schema are not caught). No CommonMark validation of prose between fences. |

## Known limitations going into v0.13.0-alpha

- The scanner does not understand list-indented or block-quote-indented fences. Real-world fences in markdown files almost always sit at column 0 or with ≤3 leading spaces (the CommonMark allowance) and that is what the scanner handles. Fences inside list items with deeper indentation are not currently linted.
- Nested-htmd detection only checks for opens that look like `^\s{0,3}\`{3,}\s*htmd[:\s]`. A pathological `~~~htmd:foo` inside a 3-backtick outer would not be caught (the outer doesn't allow it as a nested open anyway), but a tilde-fenced htmd block is not a documented form and is not flagged elsewhere either.
- htmd-meta unknown-directive is a warning, not an error, because v0.6.0 locked the forward-compat behaviour: unknown directives are preserved verbatim on `decision.metadata`. Lint surfaces them so the agent author can spot typos; it does not fail the build.
- No `htmd lint --fix`. Most issues (unknown templates, schema errors) are not mechanically fixable; the few that are (e.g. quoting a string-shaped value) would require parsing → reformatting the fence body, which inflates scope past one phase.
