#!/usr/bin/env node
// openclaw-webappdata-hook.mjs — bridge between Telegram WebAppData and
// OpenClaw. Reads a Telegram update JSON on stdin, unwraps
// update.message.web_app_data, and dispatches the prompt via the existing
// `openclaw agent --message ... --deliver` path.
//
// Why a standalone script: the OpenClaw npm package is installed globally
// and the gateway's Telegram adapter shouldn't be patched in-place.
// Instead, wire this as an outbound hook — either:
//   (a) configure a Telegram webhook on the bot pointing at htmd serve's
//       /tg-webhook endpoint (preferred — fully self-contained), OR
//   (b) call this script directly from any process that receives the
//       Telegram update (e.g., a small custom poller, or as a transform
//       under ~/.openclaw/hooks/transforms/ if your gateway supports it).
//
// Usage:
//   cat update.json | node openclaw-webappdata-hook.mjs
//
// Env (same as htmd serve's openclaw-local submit mode):
//   HTMD_OPENCLAW_BIN          (default: openclaw on PATH)
//   HTMD_OPENCLAW_AGENT        (default: main)
//   HTMD_OPENCLAW_CHANNEL      (default: telegram)
//   HTMD_OPENCLAW_REPLY_TO     (default: update.message.chat.id)
//   HTMD_OPENCLAW_SESSION_STORE (default: ~/.openclaw/agents/<agent>/sessions/sessions.json)

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

function log(obj) {
  process.stderr.write('[openclaw-webappdata-hook] ' + JSON.stringify(obj) + '\n');
}

async function lookupSessionId({ agent, channel, replyTo }) {
  const home = process.env.HOME;
  const path = process.env.HTMD_OPENCLAW_SESSION_STORE
    || `${home}/.openclaw/agents/${agent}/sessions/sessions.json`;
  try {
    const raw = await readFile(path, 'utf8');
    const store = JSON.parse(raw);
    const key = `agent:${agent}:${channel}:direct:${replyTo}`;
    const e = store[key];
    if (e && typeof e.sessionId === 'string') return e.sessionId;
  } catch (err) {
    log({ event: 'session-lookup-error', error: err.message });
  }
  return null;
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    log({ event: 'empty-stdin' });
    process.exit(2);
  }
  let update;
  try { update = JSON.parse(raw); } catch (e) {
    log({ event: 'bad-json', error: e.message });
    process.exit(2);
  }
  const msg = update?.message || update?.edited_message || null;
  const webApp = msg?.web_app_data;
  if (!webApp || typeof webApp.data !== 'string') {
    log({ event: 'no-web-app-data' });
    process.exit(0);
  }
  let payload;
  try { payload = JSON.parse(webApp.data); } catch (e) {
    log({ event: 'bad-payload', error: e.message, raw: webApp.data.slice(0, 200) });
    process.exit(2);
  }
  const prompt = (payload?.prompt || '').toString();
  if (!prompt.trim()) {
    log({ event: 'empty-prompt' });
    process.exit(2);
  }
  const chatId = msg?.chat?.id ? String(msg.chat.id) : '';
  const replyTo = process.env.HTMD_OPENCLAW_REPLY_TO || chatId;
  if (!replyTo) {
    log({ event: 'no-reply-to' });
    process.exit(2);
  }
  const agent = process.env.HTMD_OPENCLAW_AGENT || 'main';
  const channel = process.env.HTMD_OPENCLAW_CHANNEL || 'telegram';
  const bin = process.env.HTMD_OPENCLAW_BIN || 'openclaw';
  const sessionId = process.env.HTMD_OPENCLAW_SESSION_ID
    || await lookupSessionId({ agent, channel, replyTo });

  const args = ['agent', '--agent', agent, '--message', prompt, '--deliver'];
  if (sessionId) args.push('--session-id', sessionId);
  args.push('--reply-channel', channel);
  args.push('--reply-to', replyTo);

  log({
    event: 'dispatched',
    agent,
    channel,
    chatId: replyTo,
    contextId: payload.contextId || '',
    promptLen: prompt.length,
    sessionId: sessionId || null
  });

  const child = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', (err) => { log({ event: 'spawn-error', error: err.message }); process.exit(2); });
  child.on('close', (code) => process.exit(code || 0));
}

main().catch((e) => {
  log({ event: 'fatal', error: e.message });
  process.exit(2);
});
