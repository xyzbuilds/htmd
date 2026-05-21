# htmd adapters

An **adapter** is a small shim between an agent harness (OpenClaw,
Claude Code, etc.) and htmd's routing pipeline. It is not part of
the htmd package; you copy it into your harness's hooks dir and adjust.

This doc covers the OpenClaw Stop-hook adapter shipped with
v0.5.0-alpha, the cowork-mcp adapter shipped with v0.5.0-beta, and
the Cursor adapter shipped with v0.7.0-alpha.

## What an adapter does

For every outbound assistant message, the adapter:

1. Reads the raw text on stdin.
2. Pipes it through `htmd normalize --json` to canonicalize the
   format and learn `format` + `chars`.
3. Pipes the result through `htmd route --render --transport <name>`
   with any intent flags it can sniff (`--needs-approval`,
   `--prefer-inline`, …).
4. Branches on the JSON decision:
   - `action: "inline"` → print the inline body back to stdout so
     the harness delivers as normal chat.
   - `action: "page"` → emit a control line the harness understands
     (e.g., `[[htmd:page id=… url=… submit=…]]`) and suppress the
     inline send. The transport has already published the page and
     produced the chat-side artifact (a Telegram inline-keyboard
     `web_app` button, in OpenClaw's case).

Total wiring per harness: ~50 lines. The reference adapter is at
[`examples/adapters/openclaw-stop-hook.mjs`](../examples/adapters/openclaw-stop-hook.mjs).

## OpenClaw adapter (v0.5.0-alpha)

Prerequisites:

- `htmd` 0.5.0-alpha.0+ on `PATH` (or set `HTMD_BIN`).
- `htmd serve` running with `--mode openclaw-local` (or
  `openclaw-ssh` for the older path).
- `HTMD_MINI_APP_BASE` set if you want Telegram's Mini App button
  instead of a plain link.

Install:

```bash
mkdir -p ~/.openclaw/hooks
cp ~/code/htmd/examples/adapters/openclaw-stop-hook.mjs \
   ~/.openclaw/hooks/stop-htmd-route.mjs
chmod +x ~/.openclaw/hooks/stop-htmd-route.mjs
```

Register it as a Stop hook in OpenClaw's config (the exact field
depends on your OpenClaw version; see `~/clawd/AGENTS.md`).

## Failure modes

- **Transport publish throws.** `htmd route --render` returns
  `action: "inline"`, `reason: "transport-failure"`, an `error` field,
  and `inlinePrefix: "(htmd page failed: <one-line reason>)"`. The
  adapter delivers the inline body with the prefix prepended, so the
  user always gets something rather than a black hole.
- **Adapter itself throws.** The reference adapter falls back to
  re-emitting the raw assistant text. Worst case: the user sees the
  unrouted reply, which is exactly the pre-v0.5 behavior.
- **`htmd` not on PATH.** Same fallback; check `HTMD_BIN`.

## Cowork adapter (v0.5.0-beta)

The cowork-mcp adapter targets Claude Code / Claude Desktop **cowork**
sessions. Cowork is Anthropic's multi-user collaborative product;
`cowork-mcp` is the MCP server interface that lets external tools
inject turns into a session.

Prerequisites:

- `htmd` 0.5.0-beta.0+ on `PATH` (or set `HTMD_BIN`).
- A way for the cowork session to ingest submissions. Two options ship
  with v0.5.0-beta:
  - **`HTMD_COWORK_DELIVERY=file`** (default) — submissions append as
    newline-JSON to `~/.htmd/cowork/inbox.jsonl`. A small sidecar (or
    the cowork-mcp server itself, once wired) tails the file and
    replays each entry as a user turn in the addressed session.
  - **`HTMD_COWORK_DELIVERY=http`** — submissions POST to
    `HTMD_COWORK_MCP_URL`. This is the stand-in for the eventual MCP
    control surface call; the wire shape is `{ id, sessionId, action,
    payload }` and the call site is one swap away from the real MCP
    invocation once the spec lands.
- `HTMD_COWORK_SESSION_ID` set if you want submissions to address a
  specific cowork session. Otherwise the transport leaves the field
  empty and lets the receiving sidecar route by id.

Install:

```bash
mkdir -p ~/.claude/hooks
cp ~/code/htmd/examples/adapters/cowork-stop-hook.mjs \
   ~/.claude/hooks/stop-htmd-route.mjs
chmod +x ~/.claude/hooks/stop-htmd-route.mjs
```

Register it as a Stop hook in your harness's `settings.json` (Claude
Code config). The hook command is `~/.claude/hooks/stop-htmd-route.mjs`.

## Cursor adapter (v0.7.0-alpha)

The Cursor adapter targets Cursor IDE chat sessions via the `cursor`
transport. Cursor exposes custom MCP (Model Context Protocol) servers
over stdio; the long-term plan (v0.8.0) is a first-party htmd MCP
server that Cursor launches as a child process and addresses turn by
turn. v0.7.0 lands the transport shape — publish + deliver — with a
stubbed delivery call site that swaps in for the real MCP invocation
without touching the transport contract.

Prerequisites:

- `htmd` 0.7.0-alpha.0+ on `PATH` (or set `HTMD_BIN`).
- A way for the Cursor session to ingest submissions. Three modes ship:
  - **`HTMD_CURSOR_DELIVERY=file`** (default) — submissions append as
    newline-JSON to `~/.htmd/cursor/inbox.jsonl`. A small sidecar
    (eventually the htmd MCP server itself) tails the file and replays
    each entry into the addressed Cursor session.
  - **`HTMD_CURSOR_DELIVERY=http`** — submissions POST to
    `HTMD_CURSOR_MCP_URL`. Stand-in for the eventual MCP control call;
    the wire shape is `{ id, sessionId, workspace, action, payload }`
    and the call site is one swap away from a real MCP invocation.
  - **`HTMD_CURSOR_DELIVERY=noop`** — log + ok; smoke test only.
- `HTMD_CURSOR_SESSION_ID` (optional) — addresses submissions to a
  specific Cursor chat session.
- `HTMD_CURSOR_WORKSPACE` (optional) — Cursor project path / id for
  the submission. Until the MCP server is wired, both fields are
  passed through the inbox so a sidecar can route correctly.

Install:

```bash
mkdir -p ~/.cursor/hooks
cp ~/code/htmd/examples/adapters/cursor-stop-hook.mjs \
   ~/.cursor/hooks/stop-htmd-route.mjs
chmod +x ~/.cursor/hooks/stop-htmd-route.mjs
```

Wire the script in as the Cursor harness's outbound message hook. Until
Cursor exposes a stable Stop-hook contract, run the adapter from the
host wrapping Cursor's CLI (the standalone "agent loop" path) or from
the sidecar that ingests `inbox.jsonl`.

The Cursor adapter emits a control line identical in shape to the
cowork adapter, with `transport=cursor`:

```text
[[htmd:page transport=cursor id=… url=… submit=…]]
```

Three adapters now share that line shape; harnesses that consume the
shape can dispatch on the `transport` tag alone.

## htmd MCP server (v0.8.0) — one server replaces N adapters

The adapters above ship for harnesses that don't natively speak MCP
(OpenClaw's Stop hook, Cursor's outbound message hook, etc.). For
**MCP-aware agents** — Claude Code, Claude Desktop, Cursor's MCP
integration, Aider, and anything else that already shells out to an
MCP server — htmd v0.8.0 ships a first-party MCP server that exposes
the htmd CLI surface directly. **One server, zero adapters.**

### What it is

`htmd mcp` starts an MCP server on stdio. It exposes every primary
CLI subcommand as a tool:

| MCP tool          | CLI subcommand   |
|-------------------|------------------|
| `htmd_render`     | `htmd render`    |
| `htmd_compose`    | `htmd compose`   |
| `htmd_route`      | `htmd route`     |
| `htmd_normalize`  | `htmd normalize` |
| `htmd_detect`     | `htmd detect`    |
| `htmd_extract`    | `htmd extract`   |
| `htmd_templates`  | `htmd templates` |
| `htmd_schema`     | `htmd schema`    |

### Design contract (locked for v0.8.0)

1. **1:1 with CLI subcommands.** No MCP-only tools. No convenience
   wrappers that don't exist as a shell command.
2. **Thin wrapper.** Each tool internally calls the same exported
   function the CLI calls. No parallel implementation.
3. **Stateless.** Zero cache, zero session, zero persistence. Same
   input → same output, every time.
4. **CLI-equivalent in every response.** Every successful tool
   response carries `_debug.cli_equivalent` — a shell command that
   reproduces the call exactly.

These rules preserve htmd's "deterministic CLI, no backend" principle:
the MCP server is *one more transport*, not a parallel codebase.

### Wiring it up

Add to your MCP client config (Claude Desktop / Claude Code / Cursor /
Aider — exact field names vary):

```json
{
  "mcpServers": {
    "htmd": {
      "command": "htmd",
      "args": ["mcp"]
    }
  }
}
```

Or, if `htmd` isn't on PATH for the harness, point at the bin:

```json
{
  "mcpServers": {
    "htmd": {
      "command": "node",
      "args": ["/path/to/htmd/bin/htmd.js", "mcp"]
    }
  }
}
```

The server logs a banner to stderr on startup; clients may capture or
ignore it (the MCP spec allows server stderr for logging). Stdin
closes → server exits cleanly.

### What it does NOT do

- **No transport publishing.** `htmd_route` returns just the decision.
  Publishing a routed page via a transport (`openclaw-telegram`,
  `cowork-mcp`, `cursor`) requires host-side state — the renders dir,
  the serve daemon, the bot creds — none of which belongs in a
  stateless MCP server. Adapters still own the publish step.
- **No streaming.** Each tool call returns a single response.
- **No SDK dependency.** The server is hand-rolled (~200 LOC) on top
  of newline-delimited JSON-RPC over stdio. The official
  `@modelcontextprotocol/sdk` pulls in Express, Hono, JOSE, cors, and
  ~15 other deps — too heavy for htmd's "no frameworks" principle.
  Tradeoff documented in `PHASE3_NOTES.md`.

## Webhook transport (v0.12.0-alpha)

The `webhook` transport is the lowest-friction integration: any agent
harness that can POST JSON can deliver via htmd, without writing a
per-harness transport file. The other transports (openclaw-telegram,
cowork-mcp, cursor) exist because their target surfaces have a specific
wire format (Telegram inline keyboards, MCP control calls, IDE session
addressing). When you don't need any of that — when "POST the envelope
to my server and tell me where you put it" is enough — use `webhook`.

### When to use it

- A custom agent harness with a simple HTTP listener.
- A Lambda / Cloud Run / Fly Machine that ingests publish + deliver
  events from htmd.
- An existing chat bot that already accepts webhook calls and wants to
  add htmd page delivery without forking the htmd codebase.

Don't use it if a dedicated transport (openclaw-telegram, cowork-mcp,
cursor) covers your harness — those carry harness-specific addressing
the generic webhook can't infer (Telegram chat ids, cowork sessions,
Cursor workspaces).

### Configuration

Layered like the rest of htmd config — explicit opts > env > config
file > defaults.

| Key                              | Env override                  | Default |
|----------------------------------|-------------------------------|---------|
| `transports.webhook.url`         | `HTMD_WEBHOOK_URL`            | (required) |
| `transports.webhook.headers`     | `HTMD_WEBHOOK_HEADERS` (JSON) | `{}` |
| `transports.webhook.timeout_ms`  | `HTMD_WEBHOOK_TIMEOUT_MS`     | `10000` |
| `transports.webhook.retries`     | `HTMD_WEBHOOK_RETRIES`        | `0` |

`headers` is an object; values are forwarded verbatim. Use it for
`Authorization: Bearer …` or any other token your receiver expects.

### Wire shape

Both `publish` and `deliver` POST a JSON body to the configured URL.
The body's `op` field discriminates:

```json
// publish
{ "op": "publish", "slug": "reply", "renderedHtml": "<…>", "markdown": "…", "meta": {} }

// deliver
{ "op": "deliver", "id": "r-42", "action": "approve", "payload": { … } }
```

`publish` expects a JSON response with at least `{ id, url,
submitEndpoint }`; extra fields are passed through to the adapter. A
missing field is treated as a transport failure (router falls back to
inline with `(htmd page failed: webhook-invalid-response …)`).

`deliver` reads only the status code. 2xx → `{ ok: true }`. Anything
else → `{ ok: false, reason: webhook-4xx | webhook-5xx | webhook-timeout
| webhook-error }`.

### Retry + timeout semantics

- 4xx → **permanent**. Not retried. The router treats it as transport
  failure and falls back to inline.
- 5xx → **retryable**. Retried up to `retries` extra attempts (so
  `retries=2` = 3 total). Linear 50ms-step backoff between attempts.
- Network / fetch errors → **retryable**, same budget as 5xx.
- Timeout → **not retried**. The receiver had its budget and missed it.

### Reference adapter

`examples/adapters/webhook-curl.sh` — a ~70-line bash adapter that
mirrors the structure of the Node adapters in this directory. Wire it
in as your harness's outbound message hook. Requires `jq` for parsing
the decision JSON.

```bash
export HTMD_WEBHOOK_URL='https://your-server.example/htmd-hook'
export HTMD_WEBHOOK_HEADERS='{"Authorization":"Bearer …"}'
~/code/htmd/examples/adapters/webhook-curl.sh < message.md
```

On `action: "page"` it emits the same control-line shape as the cowork
/ cursor adapters:

```text
[[htmd:page transport=webhook id=… url=… submit=…]]
```

## Writing a new adapter — the cowork walkthrough

The three reference adapters are nearly identical. Reading them side
by side is the fastest way to see what a new adapter has to do.

```
examples/adapters/openclaw-stop-hook.mjs   ← v0.5.0-alpha
examples/adapters/cowork-stop-hook.mjs     ← v0.5.0-beta
examples/adapters/cursor-stop-hook.mjs     ← v0.7.0-alpha
examples/adapters/webhook-curl.sh          ← v0.12.0-alpha (bash, generic)
```

Differences are entirely in two lines:

1. The `HTMD_TRANSPORT` default (`openclaw-telegram` → `cowork-mcp` →
   `cursor`).
2. The control line emitted on `action: "page"` carries a `transport=`
   tag so the harness knows which delivery surface owns the submit
   endpoint:

   ```text
   openclaw: [[htmd:page id=… url=… submit=…]]
   cowork:   [[htmd:page transport=cowork-mcp id=… url=… submit=…]]
   cursor:   [[htmd:page transport=cursor id=… url=… submit=…]]
   ```

Everything else — stdin read, `htmd normalize --json` invocation,
intent sniff, decision JSON parse, inline-vs-page branch, failure
fallback — is shared. **That sameness is the v0.5.0-beta acceptance
criterion**: if the cowork adapter had to know anything special about
the cowork-mcp transport's internals, the abstraction wasn't ready.

To write a third adapter (VS Code, Cursor, …):

1. Copy `cowork-stop-hook.mjs`.
2. Change the `HTMD_TRANSPORT` default to your transport's `name`.
3. Adjust the `[[htmd:page …]]` control line to whatever your harness
   recognizes (or replace with a direct API call if the harness has
   one).
4. Implement the matching transport in `src/transports/<name>.js`
   mirroring `cowork-mcp.js`. Lift the publish/deliver pattern;
   replace the inbox/http call site with whatever your target chat
   surface needs.
5. Add tests that exercise `applyDecision` with your transport,
   including the publish-failure → inline fallback case.

The key constraint stays the same as alpha: **the adapter never sees
the rendered HTML.** It only sees the routing decision and either
suppresses or delegates delivery. The transport owns publishing and
reply. The router owns the inline-vs-page decision. Both are shared
across adapters, which is why adapter authorship is ~50 lines per
harness.
