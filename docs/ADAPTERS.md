# htmd adapters

An **adapter** is a small shim between an agent harness (OpenClaw,
Claude Code, etc.) and htmd's routing pipeline. It is not part of
the htmd package; you copy it into your harness's hooks dir and adjust.

This doc covers the OpenClaw Stop-hook adapter shipped with
v0.5.0-alpha. The cowork-mcp adapter lands with v0.5.0-beta.

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

## Writing a new adapter (preview)

The cowork-mcp adapter (v0.5.0-beta) will use the same pattern but
target a different transport. The walkthrough lives in this file
post-beta. The key constraint: the adapter never sees the rendered
HTML. It only sees the routing decision and either suppresses or
delegates delivery. That keeps the routing logic in htmd core where
both adapters share it.
