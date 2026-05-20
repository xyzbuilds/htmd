#!/usr/bin/env node
// examples/adapters/cursor-stop-hook.mjs
//
// Reference Stop-hook adapter for wiring htmd Phase 3 routing into a
// Cursor IDE session via the `cursor` transport. Same shape as
// cowork-stop-hook.mjs — only the transport name and the page-control
// line differ — which is the v0.7.0 claim: a third adapter rides the
// same routing + transport contract without forcing another refactor.
//
// Pipeline (per outbound assistant turn):
//
//   stdin (raw assistant text)
//     → htmd normalize --json
//     → htmd route --render --transport cursor
//     → if action=inline: print the markdown back, let the harness send it
//     → if action=page:   suppress inline send; emit a control line the
//                         Cursor harness (or sidecar) recognizes. The
//                         transport has already published the page; the
//                         user opens it locally and submissions flow back
//                         via the cursor delivery surface (default:
//                         file-drop to ~/.htmd/cursor/inbox.jsonl).
//
// Env knobs:
//   HTMD_BIN                   — path to the htmd CLI (default: `htmd`)
//   HTMD_TRANSPORT             — override the transport (default: cursor)
//   HTMD_CURSOR_SESSION_ID     — cursor chat session id to address submissions to
//   HTMD_CURSOR_WORKSPACE      — cursor workspace path / id
//   HTMD_CURSOR_DELIVERY       — file (default) | http | noop
//   HTMD_CURSOR_MCP_URL        — http delivery endpoint (stand-in for the
//                                eventual htmd MCP server, v0.8.0)
//   HTMD_CURSOR_INBOX          — file-mode inbox path
//
// Failure handling matches the v0.5.0-alpha contract: if publish fails,
// htmd route falls back to inline with a `(htmd page failed: …)` prefix.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HTMD_BIN = process.env.HTMD_BIN || 'htmd';
const TRANSPORT = process.env.HTMD_TRANSPORT || 'cursor';

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

  const normJson = await run(HTMD_BIN, ['normalize', '--json'], raw);
  const norm = JSON.parse(normJson);

  const routeArgs = [
    'route',
    '--render',
    '--transport', TRANSPORT,
    '--slug', 'reply'
  ];
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

  // action === 'page'. The page is already published; the harness should
  // suppress the inline reply and surface the URL to the user. Control
  // line shape mirrors the cowork adapter so harnesses can share the same
  // regex; `transport=cursor` distinguishes which delivery surface owns
  // the submit endpoint.
  const { id, url, submitEndpoint } = decision.rendered;
  process.stdout.write(
    `[[htmd:page transport=cursor id=${id} url=${url} submit=${submitEndpoint}]]\n`
  );
}

main().catch((e) => {
  console.error(`cursor-stop-hook: ${e.message}`);
  try {
    const raw = readFileSync(0, 'utf8');
    process.stdout.write(raw);
  } catch {
    // already consumed; nothing we can do.
  }
  process.exit(0);
});
