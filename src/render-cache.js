// Content-hash render cache.
//
// Maps (template + template-source + data + options + mode) → rendered HTML.
// Opt-in via `cache: true` on `renderTemplate(...)` (or `--cache` on the CLI,
// or `cache.enabled: true` in config). Disabled by default.
//
// Storage is one file per entry under a directory in `os.tmpdir()` (overridable
// via `HTMD_CACHE_DIR` or the `cache.dir` option). The filename is the hex
// SHA-256 of the canonical-JSON-serialized inputs; the file contents are the
// exact rendered HTML bytes (no metadata wrapper — value-byte parity with the
// uncached path is a tested invariant).
//
// Eviction is lazy: on read, entries older than TTL are reported as misses
// and the next write will overwrite them. On write, if the directory size
// (plus the incoming entry) would exceed the cap, the oldest entries by mtime
// are unlinked until the total fits. Concurrency is best-effort; if two
// processes race to write the same key, last-writer-wins is fine because
// the value depends only on deterministic inputs.

import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  utimesSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100MB
const SUFFIX = '.html';

export function defaultCacheDir() {
  if (process.env.HTMD_CACHE_DIR) return process.env.HTMD_CACHE_DIR;
  return join(tmpdir(), 'htmd-cache');
}

// Stable JSON: sort object keys, preserve array order, treat undefined as null.
// Inline (~25 LOC) instead of pulling a dep — we only need to canonicalize
// plain JSON-safe values (data is YAML/JSON-parsed; options are scalars).
export function canonicalJson(v) {
  if (v === undefined) return 'null';
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(v).sort();
    const parts = [];
    for (const k of keys) {
      if (v[k] === undefined) continue;
      parts.push(JSON.stringify(k) + ':' + canonicalJson(v[k]));
    }
    return '{' + parts.join(',') + '}';
  }
  return 'null';
}

// Hash of the rendered template's deterministic source files. A change to
// render.js, schema.json, style.css, or script.js must invalidate cached
// entries for that template even if the data is unchanged.
export function templateSourceHash(tpl) {
  const h = createHash('sha256');
  // Hash render.js source — the only file whose code path we don't already
  // carry in `tpl.{css,js,schema}`. Read once per loadTemplate caller.
  try {
    h.update(readFileSync(join(tpl.dir, 'render.js'), 'utf8'));
  } catch {
    // If render.js is missing we still get a consistent (empty) hash.
  }
  h.update('\0');
  h.update(tpl.css || '');
  h.update('\0');
  h.update(tpl.js || '');
  h.update('\0');
  h.update(canonicalJson(tpl.schema || null));
  return h.digest('hex');
}

export function computeKey({ template, templateHash, data, options, mode }) {
  const payload = canonicalJson({
    template: String(template),
    templateHash: String(templateHash || ''),
    data: data === undefined ? null : data,
    options: options || {},
    mode: mode || 'web'
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function resolveCacheOptions(opt) {
  // `false` / undefined / null → disabled
  if (!opt) return { enabled: false };
  const o = typeof opt === 'object' ? opt : {};
  if (o.enabled === false) return { enabled: false };
  return {
    enabled: true,
    dir: o.dir || defaultCacheDir(),
    ttlMs: Number.isFinite(o.ttlMs) ? o.ttlMs : DEFAULT_TTL_MS,
    maxBytes: Number.isFinite(o.maxBytes) ? o.maxBytes : DEFAULT_MAX_BYTES
  };
}

export function cacheGet(key, opts) {
  const { dir, ttlMs } = opts;
  const file = join(dir, key + SUFFIX);
  if (!existsSync(file)) return null;
  let st;
  try {
    st = statSync(file);
  } catch {
    return null;
  }
  if (Date.now() - st.mtimeMs > ttlMs) {
    // Expired — treat as miss. The next write will overwrite.
    return null;
  }
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function cacheSet(key, html, opts) {
  const { dir, maxBytes } = opts;
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    return; // Cache write is best-effort; never fail a render because of it.
  }
  const file = join(dir, key + SUFFIX);
  const incoming = Buffer.byteLength(html);
  evictToFit(dir, maxBytes, incoming, key);
  try {
    writeFileSync(file, html);
  } catch {
    // ignore
  }
}

function evictToFit(dir, maxBytes, incoming, skipKey) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const skipName = skipKey + SUFFIX;
  const entries = [];
  let total = 0;
  for (const name of names) {
    if (!name.endsWith(SUFFIX)) continue;
    if (name === skipName) continue; // about to overwrite — its bytes don't count toward post-write total
    try {
      const st = statSync(join(dir, name));
      entries.push({ name, size: st.size, mtime: st.mtimeMs });
      total += st.size;
    } catch {
      // skip
    }
  }
  if (total + incoming <= maxBytes) return;
  entries.sort((a, b) => a.mtime - b.mtime);
  for (const e of entries) {
    if (total + incoming <= maxBytes) break;
    try {
      unlinkSync(join(dir, e.name));
      total -= e.size;
    } catch {
      // skip
    }
  }
}

// Touch an entry's mtime — useful in tests to simulate age.
export function _touch(dir, key, mtimeSec) {
  const file = join(dir, key + SUFFIX);
  utimesSync(file, mtimeSec, mtimeSec);
}
