# htmd Phase 1 — implementation notes & open items

Shipped 2026-05-12 as part of `v0.3.0`. This file captures decisions made,
known limitations, and follow-up items for Phase 2+. See `docs/SERVE.md` for
the operational guide.

## Submit pipeline — Option choice

The brief enumerated three approaches (A: programmatic OpenClaw, B: Telegram
bot, C: queue file). I shipped **two production-ready modes plus dryrun + file**:

- `dryrun` — default. Log + 200. Safe for smoke-testing the wire.
- `file` — write to `~/.htmd/inbox/<ts>.json`. Useful for testing the round-trip without delivering anywhere.
- `telegram` — direct Bot API POST (Option B). Works, but the bot-sent message does **not** auto-trigger an OpenClaw agent turn — the user has to react manually or a channel router has to inject it.
- `openclaw-ssh` — **Option A, the preferred mode.** SSH from Mac Studio to the Linux box and shell `openclaw agent --message <prompt> --deliver --reply-channel telegram --reply-to <chat>`. This DOES trigger a real agent turn that lands back in the user's Telegram chat.

### Why Option A is `openclaw-ssh` and not direct HTTP

The OpenClaw gateway on the Linux box is configured with `"bind": "lan"`, which
means it listens on `10.0.7.56:18789` (LAN) and `127.0.0.1:18789` (localhost)
but **not** on `100.120.189.81:18789` (Tailscale). The Mac Studio (the htmd
serve host, on Tailscale at `100.70.189.117`) cannot reach the gateway over
HTTP without reconfiguring the gateway's bind setting.

Rather than mutate gateway config (out of scope), I shipped the SSH proxy
which:

1. Re-uses the existing Mac Studio → Linux box SSH key-pair (verified working: `ssh xuyang-zhang@100.120.189.81 /home/xuyang-zhang/.npm-global/bin/openclaw --version` returns `OpenClaw 2026.4.24`).
2. Uses `execFile('ssh', [...])` so the user prompt is passed as a quoted argv element (no shell expansion).
3. Is fully env-driven (`HTMD_OPENCLAW_SSH_HOST`, `HTMD_OPENCLAW_BIN`, `HTMD_OPENCLAW_AGENT`, `HTMD_OPENCLAW_CHANNEL`, `HTMD_OPENCLAW_REPLY_TO`).

### Phase 2 — direct gateway POST

The placeholder `openclaw` mode is reserved for when the gateway exposes a
documented `/agent/turn` (or equivalent) HTTP endpoint. The 2026.4.x gateway
appears to have internal RPC for this (referenced from `cron-cli` and
`run-executor.runtime`), but the surface isn't documented. Migrating from
`openclaw-ssh` → `openclaw` will be a flag change only — the request payload
shape (`{ prompt, contextId, blocks }`) is mode-agnostic.

## Known limitations / things to fix later

1. **No Telegram WebApp Mini App entry yet.** The bridge JS includes a
   `Telegram.WebApp` no-op shim so the same compose page can later run as a
   Mini App without changes, but no `bot.menuButton.webApp` is configured on
   the bot side. Phase 2: wire the bot to expose the served URL as a Mini App
   button.

2. **Submit token not propagated to the in-page FAB.** If `htmd serve --token`
   is set, the in-page `fetch` call doesn't currently include the
   `X-HTMD-Token` header (we'd need to inject the token into the rendered
   page, but that re-introduces a secret in the HTML — defeats the point).
   Recommendation: keep `--token` for `curl`-driven external callers and
   leave the FAB unauthenticated, relying on Tailscale ACL for the in-page
   path. If we ever need both, switch to per-render HMAC tokens.

3. **No cleanup hook for `~/.htmd/serve.log`.** Just rotates by being
   append-only. Logrotate or manual truncate.

4. **`--serve-dir` is repository-relative.** If the user passes a relative
   dir, it's resolved against the CWD. Fine for now but might surprise people
   who run htmd from arbitrary dirs. Documented in `docs/SERVE.md`.

5. **`Telegram.WebApp.sendData` is a console.log no-op.** When we wire the
   Mini App, this needs to actually `Telegram.WebApp.sendData(JSON.stringify(payload))`
   so the bot receives the payload via the standard Mini App API.

6. **HEAD requests log no body** (correct per HTTP spec) but the test for
   "serves a render written into the dir" uses GET only; we don't have an
   explicit HEAD test. Low priority.

7. **No HMAC signing on submit payloads.** The brief mentioned an
   `--token <hmac-secret>` flag; I implemented it as a shared-secret bearer
   token (header match). If we want true HMAC, swap the header check for an
   `X-HTMD-Signature: sha256=<hex>` flow.

## End-to-end test status

All steps from the brief were exercised:

- `htmd serve` (daemonized via `scripts/serve.sh start`, pid 28855→29480), responds to `/health`.
- `htmd compose examples/data/compose-serve-demo.md --serve` produced `http://100.70.189.117:8787/r/examples-data-compose-serve-demo-md-9d84c259` (and several earlier IDs during iteration).
- From the Linux box, `curl http://100.70.189.117:8787/r/<id>` returns 200 (after HEAD-vs-GET fix; see commit history).
- From the Linux box, `curl -X POST ... /submit/<id>` returns `{"ok":true,"mode":"dryrun",...}` and `~/.htmd/serve.log` records the event.
- All 86 vitest tests pass (was 66 before; +20 new tests covering serve + helpers + dryrun submit + file submit + composer-bridge meta injection).

## Files added / changed

Added:
- `src/serve.js` — HTTP server + submit pipeline.
- `src/serve-helpers.js` — `publishRender`, `injectSubmitMeta`, `cleanupOldRenders`, `publicHost`, `makeRenderId`.
- `tests/serve.test.js` — 20 tests covering the above.
- `docs/SERVE.md` — full operational guide.
- `examples/data/compose-serve-demo.md` — round-trip-flavored compose demo.
- `scripts/serve.sh` — start/stop/restart/status/tail/foreground wrapper.
- `scripts/serve.plist` — macOS launchd template (not auto-installed).
- `NOTES.md` — this file.

Changed:
- `src/cli.js` — added `serve` command, `--serve` flag on `render` + `compose`, bumped VERSION to `0.3.0`.
- `src/compose.js` — bridge UI: added "Send to agent" button (hidden unless `<meta name="htmd-submit">` is present); bridge JS: meta detection, fetch POST handler, `Telegram.WebApp` no-op shim.
- `src/index.js` — re-export new public API.
- `package.json` — bumped to `0.3.0`.
- `README.md` — added Serving section + Phase 1 callout.
- `SKILL.md` — added `--serve` guidance for agents.

Constraint compliance:
- No new dependencies (only built-in `node:http`, `node:https`, `node:fs`, `node:path`, `node:crypto`, `node:os`, `node:child_process`).
- All v0.2 commands work unchanged. The `--serve` flag and the new "Send to agent" button are strict additions.
- Self-contained HTML stays self-contained (only the submit endpoint URL is an external dependency, and it's optional).
- No secrets in code; all delivery config via env or `~/.htmd/.htmd.env` (gitignored).
- No `git push` performed; all changes are local commits.
