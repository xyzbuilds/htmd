#!/usr/bin/env node
// examples/adapters/openclaw-stop-hook.mjs
//
// Reference Stop-hook adapter for wiring htmd Phase 3 routing into
// OpenClaw. This file is not part of the npm package; copy it into your
// OpenClaw hooks dir and adjust paths.
//
// Pipeline (per outbound assistant turn):
//
//   stdin (raw assistant text)
//     → htmd normalize
//     → htmd route --render --transport openclaw-telegram
//     → if action=inline: print the markdown back, let OpenClaw deliver
//     → if action=page:   suppress the inline send; the transport
//                         already wrote the render + (eventually) the
//                         Telegram envelope to the outbound bus.
//
// Failure handling matches the v0.5.0-alpha decision: if the transport
// fails, htmd falls back to inline with a `(htmd page failed: …)` prefix.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HTMD_BIN = process.env.HTMD_BIN || 'htmd';

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}`))));
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stdout.write(raw);
    return;
  }

  // 1. Normalize. JSON envelope so we get format + chars.
  const normJson = await run(HTMD_BIN, ['normalize', '--json'], raw);
  const norm = JSON.parse(normJson);

  // 2. Route + (if applicable) render.
  const routeArgs = [
    'route',
    '--render',
    '--transport', process.env.HTMD_TRANSPORT || 'openclaw-telegram',
    '--slug', 'reply'
  ];
  // Crude intent sniff. Replace with metadata blocks once v0.6 lands.
  if (/approve\??|ship it\??|ok to (push|deploy|merge)/i.test(norm.markdown)) {
    routeArgs.push('--needs-approval');
  }
  const decisionJson = await run(HTMD_BIN, routeArgs, norm.markdown);
  const decision = JSON.parse(decisionJson);

  if (decision.action === 'inline') {
    const prefix = decision.inlinePrefix ? decision.inlinePrefix + '\n\n' : '';
    const body = decision.inlineBody || norm.markdown;
    process.stdout.write(prefix + body);
    return;
  }

  // action === 'page' — the transport has already published. OpenClaw
  // should suppress the inline assistant message and deliver the
  // transport's web_app button envelope. Concretely: emit a control
  // line OpenClaw's outbound formatter will recognize.
  const { id, url, submitEndpoint } = decision.rendered;
  process.stdout.write(`[[htmd:page id=${id} url=${url} submit=${submitEndpoint}]]\n`);
}

main().catch((e) => {
  // On any unexpected error: do not lose the assistant turn. Print the
  // raw text so OpenClaw still delivers something.
  console.error(`openclaw-stop-hook: ${e.message}`);
  try {
    const raw = readFileSync(0, 'utf8');
    process.stdout.write(raw);
  } catch {
    // already consumed; nothing we can do.
  }
  process.exit(0);
});
