# htmd v0.4 — Phase 2 complete

Telegram Mini App support landed. Phase 1's closed loop (Telegram → Safari → POST → Telegram reply) is **untouched**; v0.4 adds a second mode on top: Telegram → in-Telegram webview → signed `sendData()` → Telegram reply, with zero per-template changes.

## What shipped

| ID | Work item | Status | Where |
|---|---|---|---|
| f1 | Real Telegram WebApp SDK (ready, expand, MainButton, sendData) | ✅ | `src/compose.js` — bridge JS |
| f2 | Telegram theme vars in `tokens.css` with htmd fallbacks | ✅ | `templates/_base/tokens.css` |
| f3 | Auto-detect Mini App vs standalone via `tg.initData` | ✅ | `src/compose.js` |
| h1 | Tailscale Funnel route `/htmd-app/*` → `127.0.0.1:8787` | 🟡 manual | `docs/MINI_APP_SETUP.md` §1 (needs sudo) |
| h2 | `--serve` prints Mini-App URL when `HTMD_MINI_APP_BASE` set | ✅ | `src/cli.js` |
| b1 | BotFather `/newapp` for `@Clawd_Waston_bot` | 🟡 manual | `docs/MINI_APP_SETUP.md` §2 (need a human in Telegram) |
| b2 | OpenClaw receives `update.message.web_app_data` and unwraps | ✅ | `src/serve.js` (`/tg-webhook` + `handleTelegramUpdate`) and `scripts/openclaw-webappdata-hook.mjs` |
| b3 | `htmd button` helper emits chat-message JSON | ✅ | `src/cli.js` |
| t1 | End-to-end test plan | ✅ | `docs/MINI_APP_SETUP.md` §5 |
| d1 | SKILL.md + AGENT_USAGE.md Mini App sections | ✅ | `SKILL.md`, `docs/AGENT_USAGE.md`, `CLAUDE.md` |

**Tests:** 86 → 92 passing (+6: 2 compose, 4 serve).

## What's still on Xuyang

Two one-time manual steps, both spelled out in `docs/MINI_APP_SETUP.md`:

1. **Tailscale Funnel route (h1)** — one sudo command on the gateway. Without this, the Mini App URL has nowhere to resolve.
2. **BotFather registration (b1)** — `/newapp` on `@Clawd_Waston_bot`. Two minutes inside Telegram.

Optional but recommended:
- Set `HTMD_MINI_APP_BASE=https://xyzubuntu.tail9f58ee.ts.net/htmd-app` in the shell that runs `htmd compose --serve` so `--serve` automatically prints the Mini App URL.
- Set `HTMD_TG_WEBHOOK_SECRET=<random>` and `tailscale … /tg-webhook` → `127.0.0.1:8787/tg-webhook`, then call Telegram's `setWebhook` with `secret_token` matching. This is the path Telegram uses to push WebAppData updates back.

## How to verify end-to-end

`docs/MINI_APP_SETUP.md` §5 has a 6-step checklist with the expected log lines on both sides (htmd serve log + openclaw gateway log). Should take under a minute once §1 and §2 are done.

## Architectural payoff

The promise of Phase 2 was: **zero per-template changes** for Mini App support. Delivered. The 17 existing templates (status-report, dashboard, decision-matrix, comparison-3-up, email-digest, slide-deck, prompt-tuner, kanban-board, concept-explainer, feedback-corrector, checklist, q-and-a, data-table, approval-list, rank-order, text-redline, priority-matrix) all auto-upgrade because:

- The compose-level bridge handles theme + MainButton + sendData.
- `tokens.css` reads `--tg-theme-*` with htmd fallbacks (single source of theming).
- The submit payload shape is identical to the FAB POST envelope (`{prompt, contextId, blocks}`), with a `via: 'tg-webapp'` marker for routing.

## Known issues

- Telegram clips `tg.sendData()` payloads at ~4kB. The bridge truncates per-block detail and keeps the aggregate prompt to ≤3500 chars. Symptom on the receiving side: `truncated: true` in the unwrapped payload. Rare for typical compose pages but worth knowing.
- The Telegram WebApp SDK script (`telegram.org/js/telegram-web-app.js`) is loaded unconditionally in compose output. In standalone offline mode it fails to load and the bridge no-ops the Mini App path — the rest of the page still works.
- If Xuyang ever ships a template that calls `MainButton` directly, it will conflict with the compose bridge. None do as of v0.4.
- `htmd serve`'s `/tg-webhook` endpoint and OpenClaw's own Telegram poller can't both consume the same bot's updates. Pick one: webhook (recommended for self-contained htmd-only setups) or polling + standalone hook script (for shared OpenClaw deployments where the bot already has other duties).

## Where to go from here (Phase 3 candidates)

- HMAC-sign the POST `/submit/<id>` envelope (Phase 1.5 polish — orthogonal to Mini App).
- Have the OpenClaw gateway expose a stable `/agent/turn` HTTP endpoint and switch `openclaw-local` mode to direct HTTP (drops the CLI spawn).
- Plugin/hook autoload protocol inside OpenClaw so the WebAppData hook doesn't need manual install. Coordinate with the gateway team.
- Per-template `[data-htmd-block-idx]` state scoping so a single compose page can include the same interactive template twice (current v1 limitation documented in `CLAUDE.md`).
