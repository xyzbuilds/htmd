// Tests for `htmd serve`, `--serve` flag, and the submit pipeline (dryrun).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, deliverSubmission } from '../src/serve.js';
import { publishRender, injectSubmitMeta, makeRenderId, cleanupOldRenders } from '../src/serve-helpers.js';
import { composeFromMarkdown } from '../src/compose.js';
import { renderTemplate } from '../src/render.js';

function httpGet(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => {
      const req = request({ method: 'GET', hostname: '127.0.0.1', port, path, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });
  });
}

function httpPost(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => {
      const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      const req = request({
        method: 'POST',
        hostname: '127.0.0.1',
        port,
        path,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...headers }
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  });
}

function freePortServer(opts) {
  return new Promise((resolve, reject) => {
    const s = startServer({ ...opts, port: 0, onReady: ({ server, port, dir, mode }) => {
      resolve({ server, port, dir, mode });
    }});
    s.on('error', reject);
  });
}

describe('serve: startServer', () => {
  let tmp;
  let logPath;
  let server;
  let port;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'htmd-serve-'));
    logPath = join(tmp, 'serve.log');
    const r = await freePortServer({ dir: join(tmp, 'renders'), bind: '127.0.0.1', mode: 'dryrun', logPath, tailscaleIp: '100.70.189.117', version: 'test' });
    server = r.server;
    port = r.port;
  });

  afterEach(() => {
    if (server) server.close();
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it('responds to /health', async () => {
    const r = await httpGet(port, '/health');
    expect(r.status).toBe(200);
    const j = JSON.parse(r.body);
    expect(j.ok).toBe(true);
    expect(j.version).toBe('test');
    expect(j.submit_mode).toBe('dryrun');
    expect(j.tailscale_ip).toBe('100.70.189.117');
  });

  it('serves the index page', async () => {
    const r = await httpGet(port, '/');
    expect(r.status).toBe(200);
    expect(r.body).toContain('htmd renders');
  });

  it('404s a missing render', async () => {
    const r = await httpGet(port, '/r/does-not-exist');
    expect(r.status).toBe(404);
  });

  it('serves a render written into the dir', async () => {
    writeFileSync(join(tmp, 'renders', 'demo-abc12345.html'), '<!doctype html><title>demo</title>');
    const r = await httpGet(port, '/r/demo-abc12345');
    expect(r.status).toBe(200);
    expect(r.body).toContain('demo');
    expect(r.headers['content-type']).toContain('text/html');
  });

  it('rejects path-traversal IDs', async () => {
    const r = await httpGet(port, '/r/..%2F..%2Fetc%2Fpasswd');
    expect(r.status).toBe(404);
  });

  it('POST /submit/<id> in dryrun mode returns 200 + ok:true', async () => {
    const r = await httpPost(port, '/submit/demo-abc', { prompt: 'hello agent', contextId: 'demo-abc', blocks: [] });
    expect(r.status).toBe(200);
    const j = JSON.parse(r.body);
    expect(j.ok).toBe(true);
    expect(j.mode).toBe('dryrun');
    expect(j.echo.promptLen).toBe('hello agent'.length);
  });

  it('POST /submit with empty prompt returns 400', async () => {
    const r = await httpPost(port, '/submit/x', { prompt: '' });
    expect(r.status).toBe(400);
  });

  it('logs submit events to logPath', async () => {
    await httpPost(port, '/submit/log-test', { prompt: 'hello', contextId: 'log-test' });
    // small wait for log write
    await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('"event":"submit"');
    expect(content).toContain('"id":"log-test"');
  });

  it('CORS preflight returns 204 with permissive headers', async () => {
    const r = await httpGet(port, '/health');
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('serve: token-protected submit', () => {
  let tmp, server, port;
  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'htmd-serve-tok-'));
    const r = await freePortServer({ dir: join(tmp, 'renders'), bind: '127.0.0.1', mode: 'dryrun', token: 'secret-shh', tailscaleIp: '100.70.189.117', version: 'test' });
    server = r.server; port = r.port;
  });
  afterEach(() => { if (server) server.close(); try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

  it('rejects POST without token', async () => {
    const r = await httpPost(port, '/submit/x', { prompt: 'hi' });
    expect(r.status).toBe(401);
  });

  it('accepts POST with token', async () => {
    const r = await httpPost(port, '/submit/x', { prompt: 'hi' }, { 'X-HTMD-Token': 'secret-shh' });
    expect(r.status).toBe(200);
  });
});

describe('serve-helpers', () => {
  it('makeRenderId produces a slug + short uuid', () => {
    const id = makeRenderId('My Cool Page');
    expect(id).toMatch(/^my-cool-page-[a-f0-9]{8}$/);
  });

  it('injectSubmitMeta inserts meta tags into <head>', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';
    const out = injectSubmitMeta(html, { submitUrl: 'http://x/submit/abc', renderId: 'abc' });
    expect(out).toContain('<meta name="htmd-submit" content="http://x/submit/abc">');
    expect(out).toContain('<meta name="htmd-render-id" content="abc">');
    expect(out.indexOf('<meta name="htmd-submit"')).toBeLessThan(out.indexOf('</head>'));
  });

  it('publishRender writes a file with the meta tag embedded', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'htmd-pub-'));
    try {
      const html = '<!doctype html><html><head><title>t</title></head><body></body></html>';
      const r = publishRender({ html, slug: 'Demo Page', dir: tmp, host: 'http://100.70.189.117:8787' });
      expect(r.id).toMatch(/^demo-page-[a-f0-9]{8}$/);
      expect(r.viewUrl).toBe('http://100.70.189.117:8787/r/' + r.id);
      expect(r.submitUrl).toBe('http://100.70.189.117:8787/submit/' + r.id);
      const written = readFileSync(r.file, 'utf8');
      expect(written).toContain('htmd-submit');
      expect(written).toContain(r.submitUrl);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('cleanupOldRenders removes files older than ttl days', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'htmd-clean-'));
    try {
      const old = join(tmp, 'old.html');
      const fresh = join(tmp, 'fresh.html');
      writeFileSync(old, 'x');
      writeFileSync(fresh, 'x');
      // backdate `old` by 30 days
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      utimesSync(old, past, past);
      const n = cleanupOldRenders(tmp, 7);
      expect(n).toBe(1);
      expect(existsSync(old)).toBe(false);
      expect(existsSync(fresh)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('compose: serve integration', () => {
  it('produces a "Send to agent" button in the bridge UI', async () => {
    const md = "```htmd:checklist\ntitle: T\nitems:\n  - title: A\n  - title: B\n```\n";
    const { html } = await composeFromMarkdown(md);
    expect(html).toContain('data-htmd-cx-send');
    expect(html).toContain('Telegram.WebApp');
  });

  it('FAB activates Send when <meta name="htmd-submit"> is injected', async () => {
    const md = "```htmd:checklist\ntitle: T\nitems:\n  - title: A\n```\n";
    const { html } = await composeFromMarkdown(md);
    const injected = injectSubmitMeta(html, { submitUrl: 'http://h/submit/abc', renderId: 'abc' });
    expect(injected).toContain('<meta name="htmd-submit"');
    expect(injected).toContain('http://h/submit/abc');
  });
});

describe('deliverSubmission: dryrun mode', () => {
  it('echoes payload', async () => {
    const r = await deliverSubmission({ id: 'x', body: { prompt: 'hi', contextId: 'x' }, mode: 'dryrun' });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('dryrun');
  });
  it('rejects empty prompts', async () => {
    const r = await deliverSubmission({ id: 'x', body: { prompt: '' }, mode: 'dryrun' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
});

describe('deliverSubmission: file mode', () => {
  it('writes the submission to the inbox', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'htmd-inbox-'));
    try {
      const r = await deliverSubmission({
        id: 'inb',
        body: { prompt: 'inbox test', contextId: 'inb' },
        mode: 'file',
        env: { HTMD_INBOX_DIR: tmp }
      });
      expect(r.ok).toBe(true);
      const files = readdirSync(tmp).filter((f) => f.endsWith('.json'));
      expect(files.length).toBe(1);
      const parsed = JSON.parse(readFileSync(join(tmp, files[0]), 'utf8'));
      expect(parsed.prompt).toBe('inbox test');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
