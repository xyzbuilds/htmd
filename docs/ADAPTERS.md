# htmd adapters

An **adapter** is a small shim between an agent harness (OpenClaw,
Claude Code, etc.) and htmd's routing pipeline. It is not part of
the htmd package; you copy it into your harness's hooks dir and adjust.

This doc covers the OpenClaw Stop-hook adapter shipped with
v0.5.0-alpha and the cowork-mcp adapter shipped with v0.5.0-beta.

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

## Writing a new adapter — the cowork walkthrough

The two reference adapters are nearly identical. Reading them side by
side is the fastest way to see what a new adapter has to do.

```
examples/adapters/openclaw-stop-hook.mjs   ← v0.5.0-alpha
examples/adapters/cowork-stop-hook.mjs     ← v0.5.0-beta
```

Differences are entirely in two lines:

1. The `HTMD_TRANSPORT` default (`openclaw-telegram` → `cowork-mcp`).
2. The control line emitted on `action: "page"` carries a `transport=`
   tag so the harness knows which delivery surface owns the submit
   endpoint:

   ```text
   openclaw: [[htmd:page id=… url=… submit=…]]
   cowork:   [[htmd:page transport=cowork-mcp id=… url=… submit=…]]
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
