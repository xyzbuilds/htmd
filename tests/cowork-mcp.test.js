import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyDecision, route } from '../src/route.js';
import { createCoworkMcpTransport, coworkMcpTransport } from '../src/transports/cowork-mcp.js';
import { getTransport, listTransports } from '../src/transports/registry.js';

const CFG = { routing: { lengthThreshold: 1500, fencedBlockMinLines: 10, defaultTransport: 'cowork-mcp' } };

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'htmd-cowork-'));
}

function fakePublishRender({ html, slug, dir, host }) {
  return {
    id: `${slug || 'reply'}-stub`,
    file: join(dir || tmpDir(), 'stub.html'),
    viewUrl: `${host || 'http://x'}/r/${slug || 'reply'}-stub`,
    submitUrl: `${host || 'http://x'}/submit/${slug || 'reply'}-stub`
  };
}

describe('cowork-mcp transport: registry', () => {
  it('registers under name "cowork-mcp"', () => {
    expect(listTransports()).toContain('cowork-mcp');
    expect(getTransport('cowork-mcp')).toBe(coworkMcpTransport);
  });

  it('exposes the required HtmdTransport shape', () => {
    expect(coworkMcpTransport.name).toBe('cowork-mcp');
    expect(typeof coworkMcpTransport.publish).toBe('function');
    expect(typeof coworkMcpTransport.deliver).toBe('function');
  });
});

describe('cowork-mcp transport: publish', () => {
  it('returns the standard envelope (id, url, submitEndpoint, file)', async () => {
    const t = createCoworkMcpTransport({
      env: { HTMD_COWORK_DELIVERY: 'noop' },
      _publishRender: fakePublishRender
    });
    const out = await t.publish({ slug: 'plan', renderedHtml: '<p>hi</p>', markdown: '', meta: {} });
    expect(out.id).toBe('plan-stub');
    expect(out.url).toMatch(/\/r\/plan-stub$/);
    expect(out.submitEndpoint).toMatch(/\/submit\/plan-stub$/);
    expect(out.file).toBeTruthy();
  });

  it('surfaces the cowork session id from meta or env', async () => {
    const fromMeta = await createCoworkMcpTransport({
      env: {},
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: { coworkSessionId: 'sess-1' } });
    expect(fromMeta.coworkSession).toBe('sess-1');

    const fromEnv = await createCoworkMcpTransport({
      env: { HTMD_COWORK_SESSION_ID: 'sess-env' },
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: {} });
    expect(fromEnv.coworkSession).toBe('sess-env');

    const unset = await createCoworkMcpTransport({
      env: {},
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: {} });
    expect(unset.coworkSession).toBeNull();
  });
});

describe('cowork-mcp transport: deliver (file mode, default)', () => {
  it('appends a JSON line to the configured inbox', async () => {
    const dir = tmpDir();
    const inbox = join(dir, 'inbox.jsonl');
    const t = createCoworkMcpTransport({
      inboxPath: inbox,
      env: { HTMD_COWORK_DELIVERY: 'file' },
      _publishRender: fakePublishRender
    });

    const r1 = await t.deliver({ id: 'r1', action: 'approve', payload: { ok: true } });
    expect(r1.ok).toBe(true);
    expect(r1.detail).toContain(inbox);
    expect(existsSync(inbox)).toBe(true);

    await t.deliver({ id: 'r2', action: 'edit', payload: { text: 'fix' }, sessionId: 'sess-X' });

    const lines = readFileSync(inbox, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].id).toBe('r1');
    expect(lines[0].action).toBe('approve');
    expect(lines[0].payload).toEqual({ ok: true });
    expect(lines[1].sessionId).toBe('sess-X');
  });

  it('prefers explicit sessionId arg over env fallback', async () => {
    const dir = tmpDir();
    const inbox = join(dir, 'inbox.jsonl');
    const t = createCoworkMcpTransport({
      inboxPath: inbox,
      env: { HTMD_COWORK_DELIVERY: 'file', HTMD_COWORK_SESSION_ID: 'env-sess' }
    });
    await t.deliver({ id: 'r', action: 'a', payload: {}, sessionId: 'arg-sess' });
    const line = JSON.parse(readFileSync(inbox, 'utf8').trim());
    expect(line.sessionId).toBe('arg-sess');
  });
});

describe('cowork-mcp transport: deliver (override + noop)', () => {
  it('routes through the injected _deliver function', async () => {
    const calls = [];
    const t = createCoworkMcpTransport({
      env: {},
      _deliver: async (submission) => {
        calls.push(submission);
        return { ok: true, detail: 'stub' };
      }
    });
    const out = await t.deliver({ id: 'x', action: 'approve', payload: 42, sessionId: 's' });
    expect(out).toEqual({ ok: true, detail: 'stub' });
    expect(calls).toEqual([{ id: 'x', action: 'approve', payload: 42, sessionId: 's' }]);
  });

  it('noop mode returns ok without writing', async () => {
    const t = createCoworkMcpTransport({ env: { HTMD_COWORK_DELIVERY: 'noop' } });
    const out = await t.deliver({ id: 'x', action: 'a', payload: {} });
    expect(out.ok).toBe(true);
    expect(out.detail).toBe('noop');
  });
});

describe('cowork-mcp transport: deliver (http mode)', () => {
  it('errors cleanly when HTMD_COWORK_MCP_URL is unset', async () => {
    const t = createCoworkMcpTransport({ env: { HTMD_COWORK_DELIVERY: 'http' } });
    const out = await t.deliver({ id: 'x', action: 'a', payload: {} });
    expect(out.ok).toBe(false);
    expect(out.detail).toContain('HTMD_COWORK_MCP_URL');
  });

  it('POSTs to HTMD_COWORK_MCP_URL via injected _deliver simulation', async () => {
    // Simulate the http path with a stubbed fetch via _deliver override
    // (the http branch's real fetch is exercised manually; this test
    // proves the call-site shape stays stable).
    const received = [];
    const t = createCoworkMcpTransport({
      env: {},
      _deliver: async (submission) => {
        received.push(submission);
        return { ok: true, detail: 'posted to http://stub' };
      }
    });
    const out = await t.deliver({ id: 'r', action: 'edit', payload: { text: 'hi' }, sessionId: 'sess' });
    expect(out.ok).toBe(true);
    expect(received[0]).toEqual({ id: 'r', action: 'edit', payload: { text: 'hi' }, sessionId: 'sess' });
  });
});

describe('cowork-mcp transport: integrates with applyDecision', () => {
  it('successful publish populates rendered envelope with transport name', async () => {
    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    expect(dec.action).toBe('page');

    const t = createCoworkMcpTransport({
      env: { HTMD_COWORK_DELIVERY: 'noop' },
      _publishRender: fakePublishRender
    });
    const out = await applyDecision(dec, '| a | b |', t, {
      slug: 'plan',
      renderer: (md) => `<p>${md}</p>`
    });
    expect(out.action).toBe('page');
    expect(out.rendered.id).toBe('plan-stub');
    expect(out.rendered.url).toMatch(/\/r\/plan-stub$/);
    expect(out.rendered.submitEndpoint).toMatch(/\/submit\/plan-stub$/);
    expect(out.rendered.transport).toBe('cowork-mcp');
  });

  it('publish failure falls back to inline with prefix', async () => {
    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    const t = createCoworkMcpTransport({
      env: {},
      _publishRender: () => { throw new Error('cowork session not joined'); }
    });
    const out = await applyDecision(dec, '| a | b |', t, { renderer: (md) => md });
    expect(out.action).toBe('inline');
    expect(out.reason).toBe('transport-failure');
    expect(out.inlinePrefix).toBe('(htmd page failed: cowork session not joined)');
    expect(out.error).toContain('cowork session not joined');
  });
});
