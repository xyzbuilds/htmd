import { describe, it, expect } from 'vitest';
import { route, applyDecision } from '../src/route.js';

const CFG = { routing: { lengthThreshold: 1500, fencedBlockMinLines: 10, defaultTransport: 'stdio' } };
const opts = (extra = {}) => ({ config: CFG, ...extra });

describe('route: rule order', () => {
  it('rule 1: --prefer-inline beats --needs-approval', () => {
    const r = route('Approve this?', opts({ preferInline: true, needsApproval: true }));
    expect(r.action).toBe('inline');
    expect(r.reason).toBe('prefer-inline');
  });

  it('rule 2: --needs-approval routes to a page', () => {
    const r = route('Ship it?', opts({ needsApproval: true }));
    expect(r.action).toBe('page');
    expect(r.reason).toBe('intent:needs-approval');
  });

  it('rule 3: --prefer-page routes to a page even for short input', () => {
    const r = route('hi', opts({ preferPage: true }));
    expect(r.action).toBe('page');
    expect(r.reason).toBe('prefer-page');
  });

  it('rule 4: a Markdown table routes to a page', () => {
    const md = '| col | val |\n|---|---|\n| a | 1 |\n';
    const r = route(md, opts());
    expect(r.action).toBe('page');
    expect(r.reason).toBe('contains-table');
  });

  it('rule 4: a long fenced block routes to a page', () => {
    const body = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const md = '```\n' + body + '\n```\n';
    const r = route(md, opts());
    expect(r.action).toBe('page');
    expect(r.reason).toBe('contains-fenced');
  });

  it('rule 4: a short fenced block does NOT trigger', () => {
    const md = 'See:\n```\nfoo()\nbar()\n```\nDone.';
    const r = route(md, opts());
    expect(r.action).toBe('inline');
  });

  it('rule 5: length over threshold routes to a page', () => {
    const md = 'x'.repeat(1600);
    const r = route(md, opts());
    expect(r.action).toBe('page');
    expect(r.reason).toBe('length>threshold');
  });

  it('rule 6: short, no table, no fence → inline', () => {
    const r = route('got it, on it.', opts());
    expect(r.action).toBe('inline');
    expect(r.reason).toBe('below-thresholds');
  });
});

describe('route: normalization is applied', () => {
  it('Telegram-flavored HTML is normalized before routing', () => {
    const r = route('Big update <b>shipped</b>.', opts());
    expect(r.input.format).toBe('telegram-html');
    expect(r.action).toBe('inline'); // short, after normalization
  });
});

describe('route: intent metadata (v0.6)', () => {
  it('metadata `needs-approval: true` forces a page', () => {
    const r = route('short reply', opts({ metadata: { 'needs-approval': true } }));
    expect(r.action).toBe('page');
    expect(r.reason).toBe('intent:needs-approval');
    expect(r.metadata).toEqual({ 'needs-approval': true });
  });

  it('metadata `inline-only: true` forces inline even for tables', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const r = route(md, opts({ metadata: { 'inline-only': true } }));
    expect(r.action).toBe('inline');
    expect(r.reason).toBe('prefer-inline');
  });

  it('metadata `inline-only` wins over metadata `needs-approval`', () => {
    const r = route('short', opts({
      metadata: { 'inline-only': true, 'needs-approval': true }
    }));
    expect(r.action).toBe('inline');
    expect(r.reason).toBe('prefer-inline');
  });

  it('metadata `prefer-page: true` forces a page', () => {
    const r = route('hi', opts({ metadata: { 'prefer-page': true } }));
    expect(r.action).toBe('page');
    expect(r.reason).toBe('prefer-page');
  });

  it('annotation-only directives (priority) do not force a route', () => {
    const r = route('short reply', opts({ metadata: { priority: 'high' } }));
    expect(r.action).toBe('inline');
    expect(r.reason).toBe('below-thresholds');
    expect(r.metadata).toEqual({ priority: 'high' });
  });

  it('unknown directives pass through unchanged', () => {
    const r = route('hi', opts({ metadata: { 'experimental-mode': 'beta' } }));
    expect(r.metadata).toEqual({ 'experimental-mode': 'beta' });
    expect(r.action).toBe('inline');
  });

  it('CLI flag and metadata agree → same decision', () => {
    const a = route('hi', opts({ needsApproval: true }));
    const b = route('hi', opts({ metadata: { 'needs-approval': true } }));
    expect(a.action).toBe(b.action);
    expect(a.reason).toBe(b.reason);
  });

  it('CLI --prefer-inline beats metadata `needs-approval`', () => {
    const r = route('hi', opts({
      preferInline: true,
      metadata: { 'needs-approval': true }
    }));
    expect(r.action).toBe('inline');
    expect(r.reason).toBe('prefer-inline');
  });

  it('metadata is extracted by route() when not alreadyNormalized', () => {
    const input = '<!-- htmd: needs-approval -->\n\nShort body.';
    const r = route(input, opts());
    expect(r.metadata).toEqual({ 'needs-approval': true });
    expect(r.action).toBe('page');
    expect(r.reason).toBe('intent:needs-approval');
  });

  it('default metadata is an empty object', () => {
    const r = route('hi', opts());
    expect(r.metadata).toEqual({});
  });
});

describe('applyDecision: transport publish + fallback', () => {
  it('inline decisions pass through unchanged', async () => {
    const dec = route('short', opts());
    const out = await applyDecision(dec, 'short', null);
    expect(out.action).toBe('inline');
    expect(out.rendered).toBeNull();
  });

  it('successful publish populates `rendered`', async () => {
    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', opts());
    const transport = {
      name: 'mock',
      async publish() {
        return { id: 'abc', url: 'http://x/r/abc', submitEndpoint: 'http://x/submit/abc' };
      },
      async deliver() { return { ok: true }; }
    };
    const out = await applyDecision(dec, '| a | b |', transport, { renderer: (md) => `<p>${md}</p>` });
    expect(out.action).toBe('page');
    expect(out.rendered).toEqual({
      id: 'abc',
      url: 'http://x/r/abc',
      submitEndpoint: 'http://x/submit/abc',
      transport: 'mock'
    });
  });

  it('publish failure falls back to inline with prefix', async () => {
    const dec = route('| a | b |\n|---|---|\n| 1 | 2 |', opts());
    const transport = {
      name: 'broken',
      async publish() { throw new Error('boom: network'); },
      async deliver() { return { ok: true }; }
    };
    const out = await applyDecision(dec, '| a | b |', transport, { renderer: (md) => md });
    expect(out.action).toBe('inline');
    expect(out.reason).toBe('transport-failure');
    expect(out.error).toContain('boom: network');
    expect(out.inlinePrefix).toBe('(htmd page failed: boom: network)');
    expect(out.inlineBody).toBe('| a | b |');
  });
});
