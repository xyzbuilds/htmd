# Telegram Mini App — setup & end-to-end test plan

This document is the manual half of htmd v0.4 Phase 2. Build agent shipped
the code (f1/f2/f3/h2/b2/b3 + docs). Two things need Xuyang's hands:

1. **h1** — register the public path with Tailscale Funnel (one sudo command).
2. **b1** — register the Mini App with @BotFather on Telegram.

After those, follow **§5 End-to-end test plan** to verify in one minute.

---

## 1. Tailscale Funnel route (work item h1)

The build agent couldn't run this because it requires `sudo` (or
`tailscale set --operator=$USER` once). Run on the **Linux gateway box**
(the one already hosting `https://xyzubuntu.tail9f58ee.ts.net`):

```bash
# Inspect current state — preserve any existing mounts.
tailscale serve status

# Add /htmd-app/* → 127.0.0.1:8787 (htmd serve). Funnel for the hostname
# is already on; this just registers a longest-match path under it.
sudo tailscale serve --bg --set-path=/htmd-app http://127.0.0.1:8787

# Verify.
tailscale serve status --json | jq '.Web."xyzubuntu.tail9f58ee.ts.net:443".Handlers'
```

Expected result — two handlers on `:443`:

```
"/"          → http://127.0.0.1:8788     (existing service, untouched)
"/htmd-app"  → http://127.0.0.1:8787     (htmd serve)
```

Then `https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/<render-id>` should
load the page that's also reachable at `http://100.70.189.117:8787/r/<id>`.

To **make it permanent in the agent's env**, set:

```bash
export HTMD_MINI_APP_BASE="https://xyzubuntu.tail9f58ee.ts.net/htmd-app"
```

…in the same shell where you run `htmd compose --serve`. From then on,
`--serve` prints the Mini-App-friendly URL in addition to the tailnet URL.

### One-time operator setup (recommended)

To stop needing `sudo` for future `tailscale serve` edits:

```bash
sudo tailscale set --operator=$USER
```

### Rollback

If anything goes wrong:

```bash
sudo tailscale serve --set-path=/htmd-app off
# or wholesale:
sudo tailscale serve reset
# then restore from /tmp/tailscale-serve-pre-htmd-app.json (build-time backup).
```

---

## 2. BotFather: register the Mini App (work item b1)

Open Telegram, message **@BotFather**, paste:

```
/newapp
```

BotFather will prompt you. Answer in order:

| Prompt | Value |
|---|---|
| **Choose a bot** | `@Clawd_Waston_bot` |
| **Title** | `htmd` |
| **Short description** | `Interactive widgets and approvals delivered from your agent.` |
| **Photo (640×360)** | Upload any 640×360 PNG. Placeholder: `docs/screenshots/mini-app-icon.png` (anything works for now; can be re-set later via `/editapp`). |
| **GIF demo** | Skip (send `/empty`) |
| **Web App URL** | `https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/placeholder` |
| **Short name** | `htmd` |

The URL is a template — Telegram only stores the **origin**
(`https://xyzubuntu.tail9f58ee.ts.net`). The actual per-render URL is
passed at message time via the `web_app` inline keyboard button (see §3).
The placeholder render id just satisfies the BotFather URL-validity check.

You'll get back a URL like `https://t.me/Clawd_Waston_bot/htmd`. You don't
need that URL for the agent flow — agents send `web_app` inline buttons
directly. Save it anyway in case you want a "direct link" entry point.

---

## 3. How agents send a Mini App button

Use the `htmd-button` helper that ships with v0.4:

```bash
htmd compose /tmp/triage.md --serve --out /tmp/triage.html
# prints the tailnet URL and (if HTMD_MINI_APP_BASE is set) the mini-app URL.

htmd button --url 'https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/triage-9d84c259' \
            --text 'Open in Telegram' \
            --message 'Triage list ready — tap to open.'
```

Output is a chat-message JSON envelope agents can hand to the
Telegram-sender pipeline:

```json
{
  "chat_id": "<set at delivery time>",
  "text": "Triage list ready — tap to open.",
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "Open in Telegram",
        "web_app": { "url": "https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/triage-9d84c259" } }
    ]]
  }
}
```

Agents that talk to Telegram via OpenClaw's `sendMessage` adapter can pass
this envelope through verbatim.

---

## 4. OpenClaw side: receiving the WebAppData (work item b2)

When the user taps the MainButton inside the Mini App, Telegram delivers
the signed payload to OpenClaw as an `update.message.web_app_data` field
on the next Telegram update for that bot. The build agent shipped a
**plugin/hook** at:

    htmd/scripts/openclaw-webappdata-hook.mjs

It contains:
- the unwrap logic (`data.via === 'tg-webapp'` envelope → flat prompt),
- the path to inject it via `openclaw agent --message ... --deliver --reply-channel telegram --reply-to <chat>`,
- session-continuity lookup identical to the htmd `openclaw-local` submit mode.

To wire it into the live OpenClaw gateway:

```bash
# As Xuyang, on the gateway host:
mkdir -p ~/.openclaw/hooks
cp ~/code/htmd/scripts/openclaw-webappdata-hook.mjs ~/.openclaw/hooks/
# Restart the gateway so the hook is picked up.
# (Watson: ask before restarting.)
```

Why a hook script rather than a patch to global `node_modules/openclaw`:
the brief explicitly forbids editing read-only places. The hook follows
the same pattern as other gateway extensions and survives `npm i -g`
upgrades.

If the gateway exposes a hook autoload path under `~/.openclaw/hooks/`,
the hook ships ready-to-run. Otherwise: invoke it manually by piping the
Telegram update JSON to it (`stdin → handler → openclaw agent ...`).

---

## 5. End-to-end test plan (work item t1)

**Pre-conditions:**
- `htmd serve` running on the gateway (`pgrep -f 'htmd.*serve' && curl -s http://127.0.0.1:8787/health`)
- `HTMD_MINI_APP_BASE` set in the same shell
- §1 Funnel route added, §2 BotFather Mini App registered, §4 hook installed
- OpenClaw gateway running (`openclaw gateway status`)

**Steps:**

1. **Publish a render.**
   ```bash
   htmd compose examples/triage.md --serve
   ```
   Expected stdout (two URLs):
   ```
   http://100.70.189.117:8787/r/triage-XXXXXXXX                ← Tailscale URL
   https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/triage-XXXXXXXX  ← Mini App URL
   ```
   Expected log line in `~/.htmd/serve.log`: none yet (no submit).

2. **Emit the button envelope.**
   ```bash
   htmd button \
     --url 'https://xyzubuntu.tail9f58ee.ts.net/htmd-app/r/triage-XXXXXXXX' \
     --text 'Open triage in Telegram' \
     --message 'Triage list ready — tap below.'
   ```
   Pipe the JSON to whatever you use to send to the bot (or paste into a
   manual sendMessage call via `curl https://api.telegram.org/bot.../sendMessage`).

3. **Tap the button in Telegram.**
   - Page opens **inside** Telegram (not Safari).
   - Telegram's bottom-of-screen MainButton appears reading `Send to agent (N)`
     where N = number of changed blocks. Disabled when N=0.
   - The htmd FAB is **hidden** (mini app mode).
   - The theme matches Telegram's light/dark theme.

4. **Interact** with a widget (toggle a checklist item, set a feedback label, etc.).
   The MainButton count badge updates.

5. **Tap MainButton.**
   - The Mini App closes.
   - Within ~2 s, Telegram delivers `update.message.web_app_data` to the bot.
   - OpenClaw hook fires; expected log line on the gateway:
     ```
     [openclaw-webappdata-hook] received contextId=triage-XXXXXXXX promptLen=NNN
     [openclaw-webappdata-hook] dispatched to agent=main channel=telegram chat=<id>
     ```
   - Watson replies in the same Telegram chat within ~10-30s, confirming
     what changed.

6. **Verify the standalone path is intact.** Open the **Tailscale URL**
   (step 1's first line) in **desktop Safari** — the page should render
   normally, the FAB should appear, and tapping Copy/Send to agent should
   work via HTTP POST as in v0.3.

**Log-line cheat sheet (so you can verify in one terminal):**

```bash
# htmd serve log
tail -F ~/.htmd/serve.log

# gateway log
journalctl --user -u openclaw.service -f
```

---

## 6. Known issues / roadmap

- The Mini App SDK script (`telegram.org/js/telegram-web-app.js`) is loaded
  unconditionally in compose output. In **standalone offline** mode it
  fails to load and the bridge JS no-ops — the page still works. This is
  by design; the script tag is cached aggressively by Telegram clients.
- 4kB payload cap: if a single compose page has many interactive blocks
  with long per-block prompts, `tg.sendData()` truncates per-block detail
  to keep the envelope under cap. The aggregate prompt is preserved up to
  3500 chars. Symptom: `truncated: true` arrives in OpenClaw side.
- `tg.MainButton` is bound from the same JS file; if Xuyang ever ships a
  template that calls `MainButton` directly, it'll conflict. None do as
  of v0.4.
