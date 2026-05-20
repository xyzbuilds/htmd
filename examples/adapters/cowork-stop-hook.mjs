#!/usr/bin/env node
// examples/adapters/cowork-stop-hook.mjs
//
// Reference Stop-hook adapter for wiring htmd Phase 3 routing into a
// Claude Code / Claude Desktop cowork session via the cowork-mcp
// transport. Same shape as openclaw-stop-hook.mjs — only the transport
// name and the page-control line differ — which is the v0.5.0-beta
// claim: the transport abstraction is OpenClaw-shaped no more.
//
// Pipeline (per outbound assistant turn):
//
//   stdin (raw assistant text)
//     → htmd normalize --json
//     → htmd route --render --transport cowork-mcp
//     → if action=inline: print the markdown back, let the harness send it
//     → if action=page:   suppress inline send; emit a control line the
//                         cowork harness recognizes. The transport has
//                         already published the page; user opens it
//                         locally and submissions flow back via the
//                         cowork-mcp delivery surface (default: file-drop
//                         to ~/.htmd/cowork/inbox.jsonl).
//
// Env knobs:
//   HTMD_BIN                   — path to the htmd CLI (default: `htmd`)
//   HTMD_TRANSPORT             — override the transport (default: cowork-mcp)
//   HTMD_COWORK_SESSION_ID     — cowork session id to address submissions to
//   HTMD_COWORK_DELIVERY       — file (default) | http | noop
//   HTMD_COWORK_MCP_URL        — http delivery endpoint (stand-in for the
//                                eventual MCP control surface)
//   HTMD_COWORK_INBOX          — file-mode inbox path
//
// Failure handling matches the v0.5.0-alpha contract: if publish fails,
// htmd route falls back to inline with a `(htmd page failed: …)` prefix.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HTMD_BIN = process.env.HTMD_BIN || 'htmd';
const TRANSPORT = process.env.HTMD_TRANSPORT || 'cowork-mcp';

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
  // line shape mirrors the OpenClaw adapter so harnesses can share the
  // same regex; the `transport` tag distinguishes which delivery surface
  // owns the submit endpoint.
  const { id, url, submitEndpoint } = decision.rendered;
  process.stdout.write(
    `[[htmd:page transport=cowork-mcp id=${id} url=${url} submit=${submitEndpoint}]]\n`
  );
}

main().catch((e) => {
  console.error(`cowork-stop-hook: ${e.message}`);
  try {
    const raw = readFileSync(0, 'utf8');
    process.stdout.write(raw);
  } catch {
    // already consumed; nothing we can do.
  }
  process.exit(0);
});
