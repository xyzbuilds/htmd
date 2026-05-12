// serve.js — lightweight HTTP server for htmd.
//
// Hosts rendered HTML at a stable URL so iOS Safari can open the page as a
// real web app (clipboard works, JS runs, no "download" coercion), and
// accepts `POST /submit/<id>` payloads from the in-page FAB so user
// feedback is routed back to the agent without copy-paste.
//
// Zero heavy deps: only Node's built-in `http`, `fs`, `path`.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

const DEFAULT_PORT = 8787;
const DEFAULT_DIR = join(homedir(), '.htmd', 'renders');
const DEFAULT_LOG = join(homedir(), '.htmd', 'serve.log');

export function defaultRenderDir() {
  return DEFAULT_DIR;
}

export function defaultLogPath() {
  return DEFAULT_LOG;
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function logLine(logPath, obj) {
  try {
    if (logPath) {
      ensureDir(resolve(logPath, '..'));
      appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
    }
  } catch {
    /* swallow log errors */
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-HTMD-Token, Authorization',
    ...headers
  });
  if (body !== undefined && body !== null) res.end(body);
  else res.end();
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function sendText(res, status, text, ctype = 'text/plain; charset=utf-8') {
  send(res, status, text, { 'Content-Type': ctype });
}

function readBody(req, maxBytes = 1024 * 256) {
  return new Promise((resolveP, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveP(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeRenderPath(dir, id) {
  // Allow [a-zA-Z0-9._-] only. Strip any path separators.
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) return null;
  // Append .html if missing.
  const candidate = id.endsWith('.html') ? id : id + '.html';
  const path = join(dir, candidate);
  if (!path.startsWith(resolve(dir))) return null;
  return path;
}

function listRenders(dir) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.html'));
  return files
    .map((f) => {
      const p = join(dir, f);
      const st = statSync(p);
      return {
        id: f.replace(/\.html$/, ''),
        file: f,
        size: st.size,
        mtime: st.mtime.toISOString()
      };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

function renderIndexHtml(items, port, tailscaleIp) {
  const rows = items.map((it) => `
    <li>
      <a href="/r/${it.id}">${escape(it.id)}</a>
      <small>${escape(it.mtime)} · ${(it.size / 1024).toFixed(1)} KB</small>
    </li>
  `).join('');
  const host = tailscaleIp ? `http://${tailscaleIp}:${port}` : `http://localhost:${port}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>htmd renders</title>
<style>
  :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color-scheme: light dark; }
  body { max-width: 720px; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.5; }
  h1 { letter-spacing: -0.02em; }
  ul { list-style: none; padding: 0; }
  li { padding: 0.65rem 0; border-bottom: 1px solid rgba(127,127,127,0.2); }
  a { font-weight: 600; }
  small { color: #888; margin-left: 0.5rem; font-variant-numeric: tabular-nums; }
  code { background: rgba(127,127,127,0.12); padding: 0.1em 0.35em; border-radius: 4px; }
  .empty { color: #888; font-style: italic; }
</style>
</head>
<body>
<h1>htmd renders</h1>
<p>Serving <code>${escape(host)}/r/&lt;id&gt;</code> — ${items.length} render${items.length === 1 ? '' : 's'}.</p>
${items.length === 0 ? '<p class="empty">No renders yet. Use <code>htmd compose --serve</code> to publish one.</p>' : `<ul>${rows}</ul>`}
</body>
</html>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Submit pipeline — route an incoming user prompt back into Xuyang's agent.
 *
 * Modes (env HTMD_SUBMIT_MODE):
 *   dryrun           — log & return 200; default. Safe for smoke-testing.
 *   telegram         — POST to Telegram Bot API sendMessage.
 *   openclaw-ssh     — SSH to the OpenClaw host and run `openclaw agent --deliver`.
 *   openclaw         — POST to the OpenClaw gateway over HTTP (requires gateway
 *                       exposed on the network; not enabled by default).
 *   file             — write to ~/.htmd/inbox/<ts>.json
 */
export async function deliverSubmission({ id, body, mode, env = process.env, logPath }) {
  const m = (mode || env.HTMD_SUBMIT_MODE || 'dryrun').toLowerCase();
  const prompt = (body && body.prompt) || '';
  const contextId = (body && body.contextId) || id;
  const blocks = (body && body.blocks) || [];
  const meta = { mode: m, id, contextId, promptLen: prompt.length, blockCount: Array.isArray(blocks) ? blocks.length : 0 };

  if (!prompt.trim()) {
    return { ok: false, status: 400, error: 'Empty prompt' };
  }

  logLine(logPath, { event: 'submit', ...meta });

  if (m === 'dryrun') {
    return { ok: true, status: 200, mode: 'dryrun', echo: { id, contextId, promptLen: prompt.length, blockCount: meta.blockCount } };
  }

  if (m === 'file') {
    const inbox = env.HTMD_INBOX_DIR || join(homedir(), '.htmd', 'inbox');
    ensureDir(inbox);
    const fname = `${Date.now()}-${id || 'noid'}.json`;
    writeFileSync(join(inbox, fname), JSON.stringify({ id, contextId, prompt, blocks, receivedAt: new Date().toISOString() }, null, 2));
    return { ok: true, status: 200, mode: 'file', written: join(inbox, fname) };
  }

  if (m === 'telegram') {
    const token = env.HTMD_TELEGRAM_BOT_TOKEN;
    const chatId = env.HTMD_TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return { ok: false, status: 500, error: 'telegram mode requires HTMD_TELEGRAM_BOT_TOKEN and HTMD_TELEGRAM_CHAT_ID' };
    }
    const prefix = env.HTMD_TELEGRAM_PREFIX || '[htmd] ';
    // Telegram sendMessage has a 4096 char limit per message. Chunk if needed.
    const text = prefix + prompt;
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      // Note: bot-sent messages don't auto-trigger an agent turn in OpenClaw;
      // see docs/SERVE.md for the recommended openclaw-ssh mode if you want
      // the prompt to actually wake an agent.
      const chunks = chunkString(text, 4000);
      const responses = [];
      for (const ch of chunks) {
        const r = await postJson(url, { chat_id: chatId, text: ch, disable_web_page_preview: true });
        responses.push(r);
      }
      logLine(logPath, { event: 'submit-delivered', mode: 'telegram', id, chunks: responses.length });
      return { ok: true, status: 200, mode: 'telegram', chunks: responses.length };
    } catch (e) {
      logLine(logPath, { event: 'submit-error', mode: 'telegram', id, error: e.message });
      return { ok: false, status: 502, error: 'telegram delivery failed: ' + e.message };
    }
  }

  if (m === 'openclaw-ssh') {
    const host = env.HTMD_OPENCLAW_SSH_HOST;
    const bin = env.HTMD_OPENCLAW_BIN || '/home/xuyang-zhang/.npm-global/bin/openclaw';
    const channel = env.HTMD_OPENCLAW_CHANNEL || 'telegram';
    const replyTo = env.HTMD_OPENCLAW_REPLY_TO || env.HTMD_TELEGRAM_CHAT_ID || '';
    const agent = env.HTMD_OPENCLAW_AGENT || 'main';
    if (!host) {
      return { ok: false, status: 500, error: 'openclaw-ssh mode requires HTMD_OPENCLAW_SSH_HOST (e.g. user@100.120.189.81)' };
    }
    try {
      // Write prompt to a temp file on the remote and pass via --message-from-file?
      // The CLI only supports --message <text>; for now, pass via stdin-style is
      // not supported either, so we pass via command argument. Length is bounded
      // because Telegram clip is ~4kB and our prompts are similar scale.
      const args = ['agent', '--agent', agent, '--message', prompt, '--deliver'];
      if (channel) args.push('--reply-channel', channel);
      if (replyTo) args.push('--reply-to', replyTo);
      const out = await sshExec(host, bin, args, { timeoutMs: 30_000 });
      logLine(logPath, { event: 'submit-delivered', mode: 'openclaw-ssh', id, stdoutLen: out.stdout.length });
      return { ok: true, status: 200, mode: 'openclaw-ssh', stdout: out.stdout.slice(0, 4000) };
    } catch (e) {
      logLine(logPath, { event: 'submit-error', mode: 'openclaw-ssh', id, error: e.message });
      return { ok: false, status: 502, error: 'openclaw-ssh delivery failed: ' + e.message };
    }
  }

  if (m === 'openclaw-local') {
    // Co-located mode: htmd serve and the OpenClaw CLI live on the same host,
    // so we just invoke the CLI directly without SSH overhead. This is the
    // intended deployment when htmd serve runs on the OpenClaw gateway host.
    const bin = env.HTMD_OPENCLAW_BIN || '/home/xuyang-zhang/.npm-global/bin/openclaw';
    const channel = env.HTMD_OPENCLAW_CHANNEL || 'telegram';
    const replyTo = env.HTMD_OPENCLAW_REPLY_TO || env.HTMD_TELEGRAM_CHAT_ID || '';
    const agent = env.HTMD_OPENCLAW_AGENT || 'main';
    if (!replyTo) {
      return { ok: false, status: 500, error: 'openclaw-local mode requires HTMD_OPENCLAW_REPLY_TO or HTMD_TELEGRAM_CHAT_ID' };
    }
    try {
      const { spawn } = await import('node:child_process');
      const args = ['agent', '--agent', agent, '--message', prompt, '--deliver'];
      if (channel) args.push('--reply-channel', channel);
      if (replyTo) args.push('--reply-to', replyTo);
      // Fire-and-forget: openclaw agent turns can take 1-3 minutes (model thinking,
      // tool calls, delivery). Blocking the HTTP request that long is bad UX and
      // most clients (curl, fetch) will time out anyway. Spawn detached, return 200
      // immediately, and log the outcome when the child eventually exits.
      const timeoutMs = Number(env.HTMD_OPENCLAW_TIMEOUT_MS) || 300_000;
      const child = spawn(bin, args, { timeout: timeoutMs, detached: false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        logLine(logPath, { event: 'submit-error', mode: 'openclaw-local', id, phase: 'spawn', error: err.message });
      });
      child.on('close', (code, signal) => {
        if (code === 0) {
          logLine(logPath, { event: 'submit-delivered', mode: 'openclaw-local', id, stdoutLen: stdout.length });
        } else {
          logLine(logPath, {
            event: 'submit-error',
            mode: 'openclaw-local',
            id,
            phase: 'exit',
            code,
            signal,
            stderr: stderr.slice(0, 500),
            stdout: stdout.slice(0, 500),
          });
        }
      });
      logLine(logPath, { event: 'submit-accepted', mode: 'openclaw-local', id, pid: child.pid });
      return { ok: true, status: 202, mode: 'openclaw-local', accepted: true, pid: child.pid };
    } catch (e) {
      logLine(logPath, { event: 'submit-error', mode: 'openclaw-local', id, phase: 'precheck', error: e.message });
      return { ok: false, status: 502, error: 'openclaw-local delivery failed: ' + e.message };
    }
  }

  if (m === 'openclaw') {
    const gw = env.HTMD_OPENCLAW_GATEWAY;
    const tok = env.HTMD_OPENCLAW_TOKEN;
    if (!gw || !tok) {
      return { ok: false, status: 500, error: 'openclaw mode requires HTMD_OPENCLAW_GATEWAY and HTMD_OPENCLAW_TOKEN' };
    }
    // The gateway's exact REST shape for agent turns is internal at v2026.4.x;
    // for now we shell out via openclaw CLI on the gateway host using a
    // pre-arranged SSH proxy. Document explicitly: this mode is a placeholder.
    return { ok: false, status: 501, error: 'openclaw HTTP mode not yet wired — use openclaw-ssh until the gateway exposes a stable /agent/turn endpoint.' };
  }

  return { ok: false, status: 400, error: `unknown HTMD_SUBMIT_MODE: ${m}` };
}

function chunkString(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [''];
}

function postJson(url, body) {
  return new Promise((resolveP, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? import('node:https') : import('node:http');
    lib.then((mod) => {
      const data = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mod.request(
        {
          method: 'POST',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
          },
          timeout: 15000
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            try {
              const parsed = JSON.parse(text);
              if (res.statusCode >= 200 && res.statusCode < 300 && parsed.ok !== false) resolveP(parsed);
              else reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            } catch (e) {
              if (res.statusCode >= 200 && res.statusCode < 300) resolveP({ raw: text });
              else reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
      req.write(data);
      req.end();
    }).catch(reject);
  });
}

function sshExec(host, bin, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolveP, reject) => {
    // Build the remote command. We quote each arg with single quotes and
    // escape any embedded single quotes by ending the quote, inserting a
    // literal escaped quote, and reopening the quote.
    const quoted = [bin, ...args].map(shQuote).join(' ');
    const remote = `bash -lc ${shQuote(quoted)}`;
    const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', host, remote];
    const child = execFile('ssh', sshArgs, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.toString().trim() || err.message;
        reject(new Error(msg));
        return;
      }
      resolveP({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' });
    });
    child.on('error', reject);
  });
}

function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Start the htmd HTTP server.
 *
 * opts: {
 *   port: 8787,
 *   bind: '0.0.0.0',
 *   dir:  absolute renders dir,
 *   token: optional HMAC/shared secret for /submit
 *   mode: submit mode override (otherwise reads HTMD_SUBMIT_MODE)
 *   logPath: absolute path; defaults to ~/.htmd/serve.log
 *   tailscaleIp: string for banner only
 *   onReady: callback({server, port})
 * }
 */
export function startServer(opts = {}) {
  // Accept opts.port === 0 to mean "pick any free port" (used by tests).
  const port = opts.port === undefined || opts.port === null || opts.port === ''
    ? DEFAULT_PORT
    : Number(opts.port);
  const bind = opts.bind || '0.0.0.0';
  const dir = resolve(opts.dir || DEFAULT_DIR);
  const token = opts.token || process.env.HTMD_SUBMIT_TOKEN || '';
  const mode = (opts.mode || process.env.HTMD_SUBMIT_MODE || 'dryrun').toLowerCase();
  const logPath = opts.logPath || DEFAULT_LOG;
  const tailscaleIp = opts.tailscaleIp || process.env.HTMD_TAILSCALE_IP || '';
  const version = opts.version || '0.3.0';

  ensureDir(dir);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        return send(res, 204);
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;

      const isRead = req.method === 'GET' || req.method === 'HEAD';

      if (isRead && (path === '/' || path === '/index.html')) {
        const items = listRenders(dir);
        return sendText(res, 200, renderIndexHtml(items, port, tailscaleIp), 'text/html; charset=utf-8');
      }

      if (isRead && path === '/health') {
        return sendJson(res, 200, {
          ok: true,
          version,
          port,
          bind,
          dir,
          tailscale_ip: tailscaleIp || null,
          submit_mode: mode,
          auth: token ? 'token' : 'open'
        });
      }

      if (isRead && path === '/list') {
        return sendJson(res, 200, { items: listRenders(dir) });
      }

      // GET /r/<id>  — serve a rendered HTML
      const matchR = /^\/r\/([^/]+)$/.exec(path);
      if (isRead && matchR) {
        const id = decodeURIComponent(matchR[1]);
        const file = safeRenderPath(dir, id);
        if (!file || !existsSync(file)) {
          logLine(logPath, { event: 'render-404', id, file, dir });
          return sendText(res, 404, 'Not found');
        }
        const ctype = extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream';
        // No-cache for renders (mtime can change)
        return sendText(res, 200, readFileSync(file, 'utf8'), ctype);
      }

      // POST /submit/<id> — receive an in-page submission
      const matchS = /^\/submit\/([^/]+)$/.exec(path);
      if (req.method === 'POST' && matchS) {
        const id = decodeURIComponent(matchS[1]);
        // Auth
        if (token) {
          const hdr = req.headers['x-htmd-token'] || '';
          if (hdr !== token) {
            logLine(logPath, { event: 'submit-unauth', id });
            return sendJson(res, 401, { ok: false, error: 'unauthorized' });
          }
        }
        let body = {};
        try {
          const raw = await readBody(req);
          body = raw ? JSON.parse(raw) : {};
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: 'invalid JSON: ' + e.message });
        }
        const result = await deliverSubmission({ id, body, mode, logPath });
        return sendJson(res, result.status || (result.ok ? 200 : 500), result);
      }

      return sendText(res, 404, 'Not found');
    } catch (e) {
      logLine(logPath, { event: 'server-error', error: e.message });
      try { sendJson(res, 500, { ok: false, error: e.message }); } catch {}
    }
  });

  server.listen(port, bind, () => {
    const actualPort = server.address()?.port || port;
    if (typeof opts.onReady === 'function') opts.onReady({ server, port: actualPort, dir, mode });
  });

  return server;
}
