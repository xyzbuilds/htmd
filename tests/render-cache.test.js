import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTemplate } from '../src/render.js';
import {
  canonicalJson,
  computeKey,
  resolveCacheOptions,
  defaultCacheDir,
  cacheGet,
  cacheSet,
  templateSourceHash,
  _touch
} from '../src/render-cache.js';
import { loadTemplate } from '../src/templates.js';

const SAMPLE_DATA = {
  title: 'Cache Test Report',
  period: 'Week of May 18, 2026',
  owner: 'cache tester',
  metrics: [{ label: 'Cache hits', value: 1 }],
  sections: {
    shipped: [{ title: 'Cache layer' }],
    in_progress: [{ title: 'Tests' }]
  }
};

let cacheDir;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'htmd-cache-test-'));
});

afterEach(() => {
  try { rmSync(cacheDir, { recursive: true, force: true }); } catch {}
});

describe('canonicalJson', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles nested objects', () => {
    const a = canonicalJson({ x: { z: 1, y: 2 }, w: [3, { b: 1, a: 2 }] });
    const b = canonicalJson({ w: [3, { a: 2, b: 1 }], x: { y: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it('drops undefined values', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 2 })).toBe('{"a":1,"c":2}');
  });

  it('coerces non-finite numbers and undefined to null', () => {
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(NaN)).toBe('null');
    expect(canonicalJson(Infinity)).toBe('null');
  });
});

describe('computeKey', () => {
  const base = {
    template: 'status-report',
    templateHash: 'abc',
    data: SAMPLE_DATA,
    options: { lang: 'en' },
    mode: 'web'
  };

  it('is stable for identical inputs', () => {
    expect(computeKey(base)).toBe(computeKey({ ...base }));
  });

  it('changes when template name changes', () => {
    expect(computeKey(base)).not.toBe(computeKey({ ...base, template: 'dashboard' }));
  });

  it('changes when template source hash changes', () => {
    expect(computeKey(base)).not.toBe(computeKey({ ...base, templateHash: 'xyz' }));
  });

  it('changes when data changes', () => {
    const altered = { ...SAMPLE_DATA, title: 'Different' };
    expect(computeKey(base)).not.toBe(computeKey({ ...base, data: altered }));
  });

  it('changes when options change', () => {
    expect(computeKey(base)).not.toBe(computeKey({ ...base, options: { lang: 'fr' } }));
  });

  it('changes when mode changes', () => {
    expect(computeKey(base)).not.toBe(computeKey({ ...base, mode: 'email' }));
  });

  it('is insensitive to data key order (canonical)', () => {
    const reversed = {};
    for (const k of Object.keys(SAMPLE_DATA).reverse()) reversed[k] = SAMPLE_DATA[k];
    expect(computeKey({ ...base, data: reversed })).toBe(computeKey(base));
  });
});

describe('resolveCacheOptions', () => {
  it('returns disabled for falsy input', () => {
    expect(resolveCacheOptions(false).enabled).toBe(false);
    expect(resolveCacheOptions(undefined).enabled).toBe(false);
    expect(resolveCacheOptions(null).enabled).toBe(false);
  });

  it('returns enabled with defaults for true', () => {
    const r = resolveCacheOptions(true);
    expect(r.enabled).toBe(true);
    expect(r.dir).toBe(defaultCacheDir());
    expect(r.ttlMs).toBe(24 * 60 * 60 * 1000);
    expect(r.maxBytes).toBe(100 * 1024 * 1024);
  });

  it('honors explicit enabled:false on an object', () => {
    expect(resolveCacheOptions({ enabled: false, dir: '/x' }).enabled).toBe(false);
  });

  it('respects custom dir / ttl / maxBytes', () => {
    const r = resolveCacheOptions({ dir: '/x', ttlMs: 1000, maxBytes: 999 });
    expect(r).toMatchObject({ enabled: true, dir: '/x', ttlMs: 1000, maxBytes: 999 });
  });
});

describe('cacheGet / cacheSet', () => {
  const opts = () => ({ enabled: true, dir: cacheDir, ttlMs: 60_000, maxBytes: 1_000_000 });

  it('miss on empty cache', () => {
    expect(cacheGet('nope', opts())).toBeNull();
  });

  it('round-trips a value byte-for-byte', () => {
    const html = '<!doctype html><html></html>';
    cacheSet('k1', html, opts());
    expect(cacheGet('k1', opts())).toBe(html);
  });

  it('returns null for entries older than TTL', () => {
    cacheSet('k2', 'data', opts());
    // backdate the file by 1 hour
    _touch(cacheDir, 'k2', Math.floor(Date.now() / 1000) - 3600);
    expect(cacheGet('k2', { ...opts(), ttlMs: 60_000 })).toBeNull();
  });

  it('evicts oldest entries when size cap exceeded', () => {
    const tightOpts = { enabled: true, dir: cacheDir, ttlMs: 60_000, maxBytes: 30 };
    cacheSet('old', '0123456789', tightOpts);   // 10 bytes
    cacheSet('mid', '0123456789', tightOpts);   // +10 = 20
    // Backdate older entries so eviction order is deterministic.
    _touch(cacheDir, 'old', Math.floor(Date.now() / 1000) - 100);
    _touch(cacheDir, 'mid', Math.floor(Date.now() / 1000) - 50);
    cacheSet('new', '0123456789', tightOpts);   // would push total to 30 = cap; fits
    expect(cacheGet('new', tightOpts)).toBe('0123456789');
    // Now a write that exceeds the cap must evict.
    cacheSet('newer', '0123456789ABCDE', tightOpts); // 15 bytes; total would be 45, evict oldest until ≤30
    expect(cacheGet('old', tightOpts)).toBeNull();
  });
});

describe('templateSourceHash', () => {
  it('changes when style.css changes', async () => {
    const tpl = await loadTemplate('status-report');
    const h1 = templateSourceHash(tpl);
    const h2 = templateSourceHash({ ...tpl, css: tpl.css + '\n/* extra */' });
    expect(h1).not.toBe(h2);
  });

  it('changes when schema changes', async () => {
    const tpl = await loadTemplate('status-report');
    const h1 = templateSourceHash(tpl);
    const h2 = templateSourceHash({ ...tpl, schema: { ...tpl.schema, _bump: 1 } });
    expect(h1).not.toBe(h2);
  });
});

describe('renderTemplate cache integration', () => {
  const cacheOpt = () => ({ dir: cacheDir, ttlMs: 60_000, maxBytes: 10_000_000 });

  it('cache hit returns byte-identical HTML to a cache miss', async () => {
    const miss = await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    const hit = await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    expect(hit).toBe(miss);
    // Sanity: the entry exists in the dir.
    expect(readdirSync(cacheDir).length).toBe(1);
  });

  it('disabled vs enabled produce byte-identical HTML', async () => {
    const disabled = await renderTemplate('status-report', SAMPLE_DATA);
    const enabled = await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    expect(enabled).toBe(disabled);
    // Force a cache hit and compare again.
    const enabledHit = await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    expect(enabledHit).toBe(disabled);
  });

  it('different data produces a different cache key', async () => {
    await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    await renderTemplate('status-report', { ...SAMPLE_DATA, title: 'Other' }, { cache: cacheOpt() });
    expect(readdirSync(cacheDir).length).toBe(2);
  });

  it('different mode produces a different cache key', async () => {
    await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt(), mode: 'email' });
    expect(readdirSync(cacheDir).length).toBe(2);
  });

  it('different lang option produces a different cache key', async () => {
    await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt() });
    await renderTemplate('status-report', SAMPLE_DATA, { cache: cacheOpt(), lang: 'fr' });
    expect(readdirSync(cacheDir).length).toBe(2);
  });

  it('expired entry is re-rendered (TTL miss)', async () => {
    const opt = { dir: cacheDir, ttlMs: 60_000, maxBytes: 10_000_000 };
    const first = await renderTemplate('status-report', SAMPLE_DATA, { cache: opt });
    const [name] = readdirSync(cacheDir);
    // Corrupt the on-disk content to prove a re-render happened — then backdate.
    writeFileSync(join(cacheDir, name), '<stale>');
    const ago = Math.floor(Date.now() / 1000) - 999_999;
    utimesSync(join(cacheDir, name), ago, ago);
    const second = await renderTemplate('status-report', SAMPLE_DATA, { cache: opt });
    expect(second).toBe(first); // re-rendered, identical
    expect(second).not.toBe('<stale>');
  });

  it('serves a hit without re-rendering (poisoned value proves it)', async () => {
    const opt = { dir: cacheDir, ttlMs: 60_000, maxBytes: 10_000_000 };
    await renderTemplate('status-report', SAMPLE_DATA, { cache: opt });
    const [name] = readdirSync(cacheDir);
    // Overwrite the cached value; a real cache hit will return this poisoned value.
    writeFileSync(join(cacheDir, name), '<poisoned/>');
    const hit = await renderTemplate('status-report', SAMPLE_DATA, { cache: opt });
    expect(hit).toBe('<poisoned/>');
  });

  it('size cap evicts oldest entries on insert', async () => {
    // Render one entry first, backdate it, then render with a tiny cap so the
    // next insert must evict the older one.
    const big = { dir: cacheDir, ttlMs: 60_000, maxBytes: 10_000_000 };
    await renderTemplate('status-report', SAMPLE_DATA, { cache: big });
    const [first] = readdirSync(cacheDir);
    const longAgo = Math.floor(Date.now() / 1000) - 1000;
    utimesSync(join(cacheDir, first), longAgo, longAgo);

    const small = { dir: cacheDir, ttlMs: 60_000, maxBytes: 1 }; // anything fits via eviction
    await renderTemplate('status-report', { ...SAMPLE_DATA, title: 'B' }, { cache: small });

    const names = readdirSync(cacheDir);
    expect(names).not.toContain(first);
    expect(names.length).toBe(1);
  });
});
