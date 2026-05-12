# Serving rendered htmd pages

`htmd v0.3.0` adds two pieces that turn an htmd page from a one-way artefact
into a real round-trip channel between an agent and the user's phone:

1. **`htmd serve`** — a tiny HTTP server (built-in `node:http`, no Express,
   no frameworks) that hosts rendered HTML files at a stable URL and accepts
   `POST /submit/<id>` payloads from the in-page FAB.
2. **`htmd compose --serve` / `htmd render --serve`** — instead of writing
   HTML to stdout or a file, publish into `~/.htmd/renders/` and print a
   public Tailscale URL the user can open on their phone. The published page
   has an extra `<meta name="htmd-submit">` tag that the compose-mode FAB
   reads so the "Send to agent" button knows where to POST.

## Why this exists

Composed HTML files sent as Telegram **document** attachments are awkward on
iOS — Safari often treats them as downloads, the in-Telegram preview is
read-only and inconsistent with JS, and clipboard-from-a-`file://` is
unreliable. Hosting the page at a URL solves all three problems and lets us
add a "Send to agent" button that closes the human-in-the-loop circle
without copy-paste.

## Quick start

```bash
# 1. Start the server (defaults: port 8787, bind 0.0.0.0, dryrun submit mode)
htmd serve

# 2. In another shell, publish a compose page
htmd compose examples/data/compose-serve-demo.md --serve
# prints: http://100.70.189.117:8787/r/htmd-serve-demo-a1b2c3d4

# 3. Open the URL on your phone, fiddle with the widgets, tap "Send all
#    changes" → the modal previews the prompt → tap "Send to agent".
#    In dryrun mode the request is just logged; pick a real mode (below)
#    to actually deliver it.
```

## CLI reference

### `htmd serve`

```
htmd serve [--port 8787] [--bind 0.0.0.0] [--dir ~/.htmd/renders]
           [--token <secret>] [--mode <mode>] [--log <path>]
           [--tailscale-ip <ip>]
```

| Option            | Default                                | Notes |
|-------------------|----------------------------------------|-------|
| `--port`          | `8787`                                 |       |
| `--bind`          | `0.0.0.0`                              | Set `127.0.0.1` for loopback-only |
| `--dir`           | `~/.htmd/renders`                      | Directory served at `/r/<id>` |
| `--token`         | _(none — open)_                        | Require `X-HTMD-Token: <secret>` on `/submit/*` |
| `--mode`          | `dryrun` (or env `HTMD_SUBMIT_MODE`)   | See "Submit pipeline" below |
| `--log`           | `~/.htmd/serve.log`                    | JSON-lines event log |
| `--tailscale-ip`  | `100.70.189.117` (or env)              | Only used for the boot banner |

#### Routes

| Path               | Method | Notes |
|--------------------|--------|-------|
| `/`                | GET    | Index page listing all renders |
| `/health`          | GET    | `{ ok, version, port, dir, tailscale_ip, submit_mode, auth }` |
| `/list`            | GET    | JSON `{ items: [...] }` of all renders |
| `/r/<id>`          | GET    | Serve the rendered HTML file |
| `/submit/<id>`     | POST   | JSON `{ prompt, contextId, blocks }` — route to the submit pipeline |

All routes return `Access-Control-Allow-Origin: *` so the in-page `fetch`
works regardless of how the page was opened.

### `htmd compose --serve` / `htmd render --serve`

Both commands gain a `--serve` flag. When set, the rendered HTML is **not**
printed to stdout; instead it is written to `~/.htmd/renders/<slug>-<id>.html`
and the public URL is printed on stdout. Submit metadata
(`<meta name="htmd-submit">`) is injected into the HTML head so the in-page
FAB can find it.

```
htmd compose <file> --serve
              [--serve-dir ~/.htmd/renders]
              [--serve-host http://100.70.189.117:8787]
              [--ttl-days 7]
```

If `htmd serve` is not running, the file is still written and the URL is
still printed, but the command prints a stderr warning so you remember to
start the server.

## Submit pipeline (delivering the prompt back to the agent)

When the page POSTs to `/submit/<id>`, the server picks one of four delivery
modes based on the `--mode` flag or the `HTMD_SUBMIT_MODE` env:

| Mode            | What happens | Status |
|-----------------|--------------|--------|
| `dryrun`        | Log + return 200. The default. Use for smoke-testing. | Always works |
| `file`          | Write JSON to `~/.htmd/inbox/<ts>.json` (or `HTMD_INBOX_DIR`). | Always works |
| `telegram`      | POST to Telegram Bot API `sendMessage` (chat id = `HTMD_TELEGRAM_CHAT_ID`, prefix `[htmd] `). | Works, but the bot-sent message does **not** automatically trigger an OpenClaw agent turn — the user (or a configured channel router) has to react. |
| `openclaw-ssh`  | SSH to the OpenClaw host (`HTMD_OPENCLAW_SSH_HOST`) and run `openclaw agent --message <prompt> --deliver --reply-channel telegram --reply-to <chat>`. This **does** trigger a real agent turn. | Recommended for the real round-trip — used in Phase 1. |
| `openclaw`      | Direct HTTP POST to the OpenClaw gateway. | Placeholder. The v2026.4 gateway does not expose a stable public REST shape for agent turns yet; use `openclaw-ssh` instead. |

### Environment variables

```bash
# Common
HTMD_SUBMIT_MODE=openclaw-ssh        # dryrun | file | telegram | openclaw-ssh | openclaw
HTMD_SUBMIT_TOKEN=...                # if you also pass --token to serve
HTMD_TAILSCALE_IP=100.70.189.117     # for the banner & --serve URLs
HTMD_PUBLIC_HOST=http://100.70.189.117:8787   # overrides everything

# Telegram mode
HTMD_TELEGRAM_BOT_TOKEN=...
HTMD_TELEGRAM_CHAT_ID=8331776182
HTMD_TELEGRAM_PREFIX="[htmd] "       # optional, default "[htmd] "

# openclaw-ssh mode
HTMD_OPENCLAW_SSH_HOST=xuyang-zhang@100.120.189.81
HTMD_OPENCLAW_BIN=/home/xuyang-zhang/.npm-global/bin/openclaw   # default
HTMD_OPENCLAW_AGENT=main              # default
HTMD_OPENCLAW_CHANNEL=telegram        # default
HTMD_OPENCLAW_REPLY_TO=8331776182     # falls back to HTMD_TELEGRAM_CHAT_ID

# openclaw HTTP mode (NOT YET WIRED — placeholder)
HTMD_OPENCLAW_GATEWAY=http://100.120.189.81:18789
HTMD_OPENCLAW_TOKEN=...
```

Put these in `~/.htmd/.htmd.env` (gitignored) and source from `scripts/serve.sh`.

### How `openclaw-ssh` works (Phase 1)

The OpenClaw gateway runs on the Linux box at `127.0.0.1:18789` (bind=lan) —
it is **not exposed over Tailscale**. To keep htmd's serve infra on Mac
Studio (per the task brief) while still delivering real agent turns, the
submit server uses `ssh` as a thin proxy:

```
phone POST /submit/<id>           (Mac Studio :8787)
   → htmd serve (Mac Studio)
   → ssh xuyang-zhang@<linux-host> "openclaw agent --message <prompt> --deliver --reply-channel telegram --reply-to <chat>"
   → openclaw gateway (Linux, localhost:18789)
   → agent turn on the user's main session
   → reply lands back in Telegram chat 8331776182
```

Requirements:
- Mac Studio has key-based SSH to the Linux box (`xyz` → `xuyang-zhang`).
- The Linux box has `openclaw` installed at `HTMD_OPENCLAW_BIN`.
- The user's main session is wired so an agent turn from `openclaw agent
  --deliver` shows up in their Telegram chat.

### Switching modes

Edit `~/.htmd/.htmd.env`, restart the server (`scripts/serve.sh restart`
once you've installed it). `htmd serve --mode openclaw-ssh` also works as a
one-off override.

## Auth & exposure

The server defaults to **bind 0.0.0.0 + no auth** because Tailscale ACL is
expected to gate access. If your Tailnet is shared or you want extra
defence-in-depth, set `--token <secret>`. The token guards `/submit/*`
only — render fetches (`/r/<id>`) are still public because they need to
load on the phone without auth headers.

For a fully private setup, run `htmd serve --bind 127.0.0.1` and tunnel
via `ssh -L 8787:127.0.0.1:8787` from the phone (impractical) or via a
Tailscale `funnel` if the user enables it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `curl http://100.70.189.117:8787/health` → connection refused | Server not running | `scripts/serve.sh start` (or just `htmd serve`) |
| `htmd compose --serve` warns the server is down | Same | Start the server, re-run compose if you want the warning gone |
| "Send to agent" button not visible in the modal | Page wasn't rendered with `--serve` | Re-render with `--serve` so the `<meta name="htmd-submit">` tag is present |
| POST returns 401 | `--token` is set; the in-page JS doesn't include the header | Either drop the token (rely on Tailscale ACL) or extend `compose.js` to inject the header at render time |
| POST returns 502 in `openclaw-ssh` mode | SSH from Mac Studio to the Linux box failed | Try `ssh xuyang-zhang@<linux-host> /home/xuyang-zhang/.npm-global/bin/openclaw --version` directly |

## Logs

By default everything is logged as JSON-lines to `~/.htmd/serve.log`:

```bash
tail -F ~/.htmd/serve.log | jq
```

The events you'll see:

```
{ "ts": "...", "event": "submit", "mode": "dryrun", "id": "...", "promptLen": 412, "blockCount": 3 }
{ "ts": "...", "event": "submit-delivered", "mode": "openclaw-ssh", "id": "...", "stdoutLen": 87 }
{ "ts": "...", "event": "submit-error", "mode": "telegram", "id": "...", "error": "HTTP 400: ..." }
{ "ts": "...", "event": "submit-unauth", "id": "..." }
```

## Security notes

- **No secrets in code.** All credentials read from env / `~/.htmd/.htmd.env`.
- **Path traversal:** render IDs are restricted to `[a-zA-Z0-9._-]+`.
- **Body size:** submit POSTs are capped at 256 KB.
- **Process boundary:** the server never writes to the renders dir except
  via `--serve` (i.e. via the htmd CLI itself); the HTTP server is read-only
  for renders.
- **`openclaw-ssh` mode** uses a stricly-quoted exec — no shell expansion of
  the user-supplied prompt happens on the Linux side.

## Roadmap

- Telegram Mini App entry: the bridge JS already includes a `Telegram.WebApp`
  no-op shim so the same compose page can run as a Mini App without changes.
- Direct OpenClaw gateway POST (eliminate the SSH proxy) once a stable
  `/agent/turn` REST endpoint is documented in OpenClaw.
- launchd / systemd unit templates in `scripts/`.
