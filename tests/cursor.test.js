import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyDecision, route } from '../src/route.js';
import { createCursorTransport, cursorTransport } from '../src/transports/cursor.js';
import { getTransport, listTransports } from '../src/transports/registry.js';

const CFG = { routing: { lengthThreshold: 1500, fencedBlockMinLines: 10, defaultTransport: 'cursor' } };

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'htmd-cursor-'));
}

function fakePublishRender({ html, slug, dir, host }) {
  return {
    id: `${slug || 'reply'}-stub`,
    file: join(dir || tmpDir(), 'stub.html'),
    viewUrl: `${host || 'http://x'}/r/${slug || 'reply'}-stub`,
    submitUrl: `${host || 'http://x'}/submit/${slug || 'reply'}-stub`
  };
}

describe('cursor transport: registry', () => {
  it('registers under name "cursor"', () => {
    expect(listTransports()).toContain('cursor');
    expect(getTransport('cursor')).toBe(cursorTransport);
  });

  it('exposes the required HtmdTransport shape', () => {
    expect(cursorTransport.name).toBe('cursor');
    expect(typeof cursorTransport.publish).toBe('function');
    expect(typeof cursorTransport.deliver).toBe('function');
  });
});

describe('cursor transport: publish', () => {
  it('returns the standard envelope (id, url, submitEndpoint, file)', async () => {
    const t = createCursorTransport({
      env: { HTMD_CURSOR_DELIVERY: 'noop' },
      _publishRender: fakePublishRender
    });
    const out = await t.publish({ slug: 'plan', renderedHtml: '<p>hi</p>', markdown: '', meta: {} });
    expect(out.id).toBe('plan-stub');
    expect(out.url).toMatch(/\/r\/plan-stub$/);
    expect(out.submitEndpoint).toMatch(/\/submit\/plan-stub$/);
    expect(out.file).toBeTruthy();
  });

  it('surfaces the cursor session id from meta or env', async () => {
    const fromMeta = await createCursorTransport({
      env: {},
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: { cursorSessionId: 'sess-1' } });
    expect(fromMeta.cursorSession).toBe('sess-1');

    const fromEnv = await createCursorTransport({
      env: { HTMD_CURSOR_SESSION_ID: 'sess-env' },
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: {} });
    expect(fromEnv.cursorSession).toBe('sess-env');

    const unset = await createCursorTransport({
      env: {},
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: {} });
    expect(unset.cursorSession).toBeNull();
  });

  it('surfaces the cursor workspace from meta or env', async () => {
    const fromMeta = await createCursorTransport({
      env: {},
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: { cursorWorkspace: '/work/htmd' } });
    expect(fromMeta.cursorWorkspace).toBe('/work/htmd');

    const fromEnv = await createCursorTransport({
      env: { HTMD_CURSOR_WORKSPACE: '/env/path' },
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: {} });
    expect(fromEnv.cursorWorkspace).toBe('/env/path');

    const unset = await createCursorTransport({
      env: {},
      _publishRender: fakePublishRender
    }).publish({ slug: 'r', renderedHtml: '', meta: {} });
    expect(unset.cursorWorkspace).toBeNull();
  });
});

describe('cursor transport: deliver (file mode, default)', () => {
  it('appends a JSON line to the configured inbox', async () => {
    const dir = tmpDir();
    const inbox = join(dir, 'inbox.jsonl');
    const t = createCursorTransport({
      inboxPath: inbox,
      env: { HTMD_CURSOR_DELIVERY: 'file' },
      _publishRender: fakePublishRender
    });

    const r1 = await t.deliver({ id: 'r1', action: 'approve', payload: { ok: true } });
    expect(r1.ok).toBe(true);
    expect(r1.detail).toContain(inbox);
    expect(existsSync(inbox)).toBe(true);

    await t.deliver({ id: 'r2', action: 'edit', payload: { text: 'fix' }, sessionId: 'sess-X', workspace: '/w' });

    const lines = readFileSync(inbox, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].id).toBe('r1');
    expect(lines[0].action).toBe('approve');
    expect(lines[0].payload).toEqual({ ok: true });
    expect(lines[1].sessionId).toBe('sess-X');
    expect(lines[1].workspace).toBe('/w');
  });

  it('prefers explicit sessionId arg over env fallback', async () => {
    const dir = tmpDir();
    const inbox = join(dir, 'inbox.jsonl');
    const t = createCursorTransport({
      inboxPath: inbox,
      env: { HTMD_CURSOR_DELIVERY: 'file', HTMD_CURSOR_SESSION_ID: 'env-sess' }
    });
    await t.deliver({ id: 'r', action: 'a', payload: {}, sessionId: 'arg-sess' });
    const line = JSON.parse(readFileSync(inbox, 'utf8').trim());
    expect(line.sessionId).toBe('arg-sess');
  });
});

describe('cursor transport: deliver (override + noop)', () => {
  it('routes through the injected _deliver function', async () => {
    const calls = [];
    const t = createCursorTransport({
      env: {},
      _deliver: async (submission) => {
        calls.push(submission);
        return { ok: true, detail: 'stub' };
      }
    });
    const out = await t.deliver({ id: 'x', action: 'approve', payload: 42, sessionId: 's', workspace: '/w' });
    expect(out).toEqual({ ok: true, detail: 'stub' });
    expect(calls).toEqual([{ id: 'x', action: 'approve', payload: 42, sessionId: 's', workspace: '/w' }]);
  });

  it('noop mode returns ok without writing', async () => {
    const t = createCursorTransport({ env: { HTMD_CURSOR_DELIVERY: 'noop' } });
    const out = await t.deliver({ id: 'x', action: 'a', payload: {} });
    expect(out.ok).toBe(true);
    expect(out.detail).toBe('noop');
  });
});

describe('cursor transport: deliver (http mode)', () => {
  it('errors cleanly when HTMD_CURSOR_MCP_URL is unset', async () => {
    const t = createCursorTransport({ env: { HTMD_CURSOR_DELIVERY: 'http' } });
    const out = await t.deliver({ id: 'x', action: 'a', payload: {} });
    expect(out.ok).toBe(false);
    expect(out.detail).toContain('HTMD_CURSOR_MCP_URL');
  });

  it('preserves the submission shape through an injected _deliver', async () => {
    const received = [];
    const t = createCursorTransport({
      env: {},
      _deliver: async (submission) => {
        received.push(submission);
        return { ok: true, detail: 'posted to http://stub' };
      }
    });
    const out = await t.deliver({ id: 'r', action: 'edit', payload: { text: 'hi' }, sessionId: 'sess', workspace: '/w' });
    expect(out.ok).toBe(true);
    expect(received[0]).toEqual({ id: 'r', action: 'edit', payload: { text: 'hi' }, sessionId: 'sess', workspace: '/w' });
  });
});

describe('cursor transport: integrates with applyDecision', () => {
  it('successful publish populates rendered envelope with transport name', async () => {
    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    expect(dec.action).toBe('page');

    const t = createCursorTransport({
      env: { HTMD_CURSOR_DELIVERY: 'noop' },
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
    expect(out.rendered.transport).toBe('cursor');
  });

  it('publish failure falls back to inline with prefix', async () => {
    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', { config: CFG });
    const t = createCursorTransport({
      env: {},
      _publishRender: () => { throw new Error('cursor mcp server not running'); }
    });
    const out = await applyDecision(dec, '| a | b |', t, { renderer: (md) => md });
    expect(out.action).toBe('inline');
    expect(out.reason).toBe('transport-failure');
    expect(out.inlinePrefix).toBe('(htmd page failed: cursor mcp server not running)');
    expect(out.error).toContain('cursor mcp server not running');
  });
});
