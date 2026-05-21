import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { applyDecision, route } from '../src/route.js';
import { createWebhookTransport, webhookTransport } from '../src/transports/webhook.js';
import { getTransport, listTransports } from '../src/transports/registry.js';

const CFG = { routing: { lengthThreshold: 1500, fencedBlockMinLines: 10, defaultTransport: 'webhook' } };

// Spin up a local HTTP server bound to 127.0.0.1:<random port>. The
// handler can be swapped per-test via the returned `setHandler` so we
// don't restart the listener between cases.
function startServer() {
  return new Promise((resolve) => {
    let handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    };
    const server = createServer((req, res) => handler(req, res));
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        setHandler: (fn) => { handler = fn; },
        close: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

async function readBody(req) {
  let buf = '';
  for await (const chunk of req) buf += chunk;
  try {
    return JSON.parse(buf);
  } catch {
    return buf;
  }
}

let srv;

beforeEach(async () => { srv = await startServer(); });
afterEach(async () => { if (srv) await srv.close(); });

describe('webhook transport: registry', () => {
  it('registers under name "webhook"', () => {
    expect(listTransports()).toContain('webhook');
    expect(getTransport('webhook')).toBe(webhookTransport);
  });

  it('exposes the required HtmdTransport shape', () => {
    expect(webhookTransport.name).toBe('webhook');
    expect(typeof webhookTransport.publish).toBe('function');
    expect(typeof webhookTransport.deliver).toBe('function');
  });
});

describe('webhook transport: publish — success path', () => {
  it('POSTs the envelope and returns the parsed result', async () => {
    let seen;
    srv.setHandler(async (req, res) => {
      seen = { method: req.method, headers: req.headers, body: await readBody(req) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'r-42',
        url: 'http://host/r/r-42',
        submitEndpoint: 'http://host/submit/r-42',
        file: '/tmp/r-42.html'
      }));
    });

    const t = createWebhookTransport({ url: srv.url });
    const out = await t.publish({
      slug: 'plan',
      renderedHtml: '<p>hi</p>',
      markdown: 'hi',
      meta: { foo: 'bar' }
    });

    expect(seen.method).toBe('POST');
    expect(seen.headers['content-type']).toBe('application/json');
    expect(seen.body).toEqual({
      op: 'publish',
      slug: 'plan',
      renderedHtml: '<p>hi</p>',
      markdown: 'hi',
      meta: { foo: 'bar' }
    });
    expect(out.id).toBe('r-42');
    expect(out.url).toBe('http://host/r/r-42');
    expect(out.submitEndpoint).toBe('http://host/submit/r-42');
    expect(out.file).toBe('/tmp/r-42.html');
  });

  it('passes Authorization header through', async () => {
    let seen;
    srv.setHandler(async (req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'r', url: 'u', submitEndpoint: 's' }));
    });

    const t = createWebhookTransport({
      url: srv.url,
      headers: { Authorization: 'Bearer sk-test', 'X-Trace': 'abc' }
    });
    await t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} });
    expect(seen.authorization).toBe('Bearer sk-test');
    expect(seen['x-trace']).toBe('abc');
  });

  it('throws webhook-invalid-response when the body lacks id/url/submitEndpoint', async () => {
    srv.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    const t = createWebhookTransport({ url: srv.url });
    await expect(t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} }))
      .rejects.toThrow(/webhook-invalid-response/);
  });
});

describe('webhook transport: publish — failure modes', () => {
  it('4xx throws webhook-4xx (no retry)', async () => {
    let attempts = 0;
    srv.setHandler((_req, res) => {
      attempts++;
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('bad envelope');
    });
    const t = createWebhookTransport({ url: srv.url, retries: 3, _sleep: async () => {} });
    await expect(t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} }))
      .rejects.toThrow(/webhook-4xx.*400/);
    expect(attempts).toBe(1); // 4xx is not retried
  });

  it('5xx retries up to `retries` then throws webhook-5xx', async () => {
    let attempts = 0;
    srv.setHandler((_req, res) => {
      attempts++;
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('upstream down');
    });
    const t = createWebhookTransport({
      url: srv.url,
      retries: 2,
      _sleep: async () => {} // skip backoff so the test is fast
    });
    await expect(t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} }))
      .rejects.toThrow(/webhook-5xx.*503/);
    expect(attempts).toBe(3); // initial + 2 retries
  });

  it('5xx then 2xx succeeds within retries budget', async () => {
    let attempts = 0;
    srv.setHandler((_req, res) => {
      attempts++;
      if (attempts < 3) {
        res.writeHead(500);
        res.end('boom');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'r', url: 'u', submitEndpoint: 's' }));
    });
    const t = createWebhookTransport({ url: srv.url, retries: 5, _sleep: async () => {} });
    const out = await t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} });
    expect(out.id).toBe('r');
    expect(attempts).toBe(3);
  });

  it('timeout throws webhook-timeout (no retry)', async () => {
    let attempts = 0;
    srv.setHandler((_req, res) => {
      attempts++;
      // Never respond — let the client abort.
      void res;
    });
    const t = createWebhookTransport({
      url: srv.url,
      timeoutMs: 80,
      retries: 3,
      _sleep: async () => {}
    });
    await expect(t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} }))
      .rejects.toThrow(/webhook-timeout/);
    expect(attempts).toBe(1); // timeout is not retried
  });

  it('missing url throws webhook-config', async () => {
    const t = createWebhookTransport({ url: '', env: {} });
    await expect(t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} }))
      .rejects.toThrow(/webhook-config/);
  });
});

describe('webhook transport: deliver', () => {
  it('POSTs the submission envelope and returns ok on 2xx', async () => {
    let seen;
    srv.setHandler(async (req, res) => {
      seen = await readBody(req);
      res.writeHead(204);
      res.end();
    });
    const t = createWebhookTransport({ url: srv.url });
    const out = await t.deliver({ id: 'r1', action: 'approve', payload: { ok: true } });
    expect(seen).toEqual({ op: 'deliver', id: 'r1', action: 'approve', payload: { ok: true } });
    expect(out.ok).toBe(true);
    expect(out.detail).toContain('posted to');
  });

  it('returns ok=false with reason=webhook-4xx on 4xx', async () => {
    srv.setHandler((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('nope');
    });
    const t = createWebhookTransport({ url: srv.url, _sleep: async () => {} });
    const out = await t.deliver({ id: 'r', action: 'a', payload: {} });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('webhook-4xx');
    expect(out.detail).toMatch(/403/);
  });

  it('returns ok=false with reason=webhook-5xx after exhausting retries', async () => {
    let attempts = 0;
    srv.setHandler((_req, res) => {
      attempts++;
      res.writeHead(502);
      res.end();
    });
    const t = createWebhookTransport({ url: srv.url, retries: 1, _sleep: async () => {} });
    const out = await t.deliver({ id: 'r', action: 'a', payload: {} });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('webhook-5xx');
    expect(attempts).toBe(2);
  });

  it('returns ok=false with reason=webhook-timeout on timeout', async () => {
    srv.setHandler(() => {/* never respond */});
    const t = createWebhookTransport({ url: srv.url, timeoutMs: 60, _sleep: async () => {} });
    const out = await t.deliver({ id: 'r', action: 'a', payload: {} });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('webhook-timeout');
  });

  it('returns ok=false with reason=webhook-config when no url configured', async () => {
    const t = createWebhookTransport({ url: '', env: {} });
    const out = await t.deliver({ id: 'r', action: 'a', payload: {} });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('webhook-config');
  });
});

describe('webhook transport: config layering', () => {
  it('reads url + headers + timeout from env when not provided directly', async () => {
    let seen;
    srv.setHandler(async (req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'r', url: 'u', submitEndpoint: 's' }));
    });
    const t = createWebhookTransport({
      env: {
        HTMD_WEBHOOK_URL: srv.url,
        HTMD_WEBHOOK_HEADERS: JSON.stringify({ 'X-Token': 't1' }),
        HTMD_WEBHOOK_TIMEOUT_MS: '5000',
        HTMD_WEBHOOK_RETRIES: '0'
      }
    });
    const out = await t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} });
    expect(out.id).toBe('r');
    expect(seen['x-token']).toBe('t1');
  });

  it('explicit opts override env values', async () => {
    let seen;
    srv.setHandler(async (req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'r', url: 'u', submitEndpoint: 's' }));
    });
    const t = createWebhookTransport({
      url: srv.url,
      headers: { 'X-Token': 'explicit' },
      env: {
        HTMD_WEBHOOK_URL: 'http://wrong.example',
        HTMD_WEBHOOK_HEADERS: JSON.stringify({ 'X-Token': 'env' })
      }
    });
    await t.publish({ slug: 'r', renderedHtml: '', markdown: '', meta: {} });
    expect(seen['x-token']).toBe('explicit');
  });
});

describe('webhook transport: integrates with applyDecision', () => {
  it('successful publish populates rendered envelope with transport=webhook', async () => {
    srv.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'plan-1',
        url: 'http://host/r/plan-1',
        submitEndpoint: 'http://host/submit/plan-1'
      }));
    });

    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    expect(dec.action).toBe('page');

    const t = createWebhookTransport({ url: srv.url });
    const out = await applyDecision(dec, '| a | b |', t, {
      slug: 'plan',
      renderer: (md) => `<p>${md}</p>`
    });
    expect(out.action).toBe('page');
    expect(out.rendered.id).toBe('plan-1');
    expect(out.rendered.transport).toBe('webhook');
  });

  it('4xx publish failure falls back to inline with transport-failure', async () => {
    srv.setHandler((_req, res) => {
      res.writeHead(401);
      res.end('unauthorized');
    });

    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    const t = createWebhookTransport({ url: srv.url, _sleep: async () => {} });
    const out = await applyDecision(dec, '| a | b |', t, { renderer: (md) => md });
    expect(out.action).toBe('inline');
    expect(out.reason).toBe('transport-failure');
    expect(out.error).toMatch(/webhook-4xx/);
    expect(out.inlinePrefix).toMatch(/^\(htmd page failed: webhook-4xx/);
  });

  it('timeout publish failure falls back to inline with transport-failure', async () => {
    srv.setHandler(() => {/* never respond */});

    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    const t = createWebhookTransport({
      url: srv.url,
      timeoutMs: 60,
      _sleep: async () => {}
    });
    const out = await applyDecision(dec, '| a | b |', t, { renderer: (md) => md });
    expect(out.action).toBe('inline');
    expect(out.reason).toBe('transport-failure');
    expect(out.error).toMatch(/webhook-timeout/);
  });
});
