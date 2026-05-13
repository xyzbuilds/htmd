// src/config.js — layered config loader for htmd Phase 3 routing.
//
// Precedence (highest → lowest):
//   1. Environment variables (HTMD_*)
//   2. Per-repo `htmd.config.json` (walked up from cwd)
//   3. Global `~/.htmd/config.json`
//   4. Built-in defaults
//
// Decision locked 2026-05-12 (see docs/PHASE3_DESIGN.md §Decisions).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULTS = Object.freeze({
  routing: {
    lengthThreshold: 1500,
    fencedBlockMinLines: 10,
    defaultTransport: 'stdio'
  },
  transports: {}
});

/** Walk up from `start` looking for `htmd.config.json`. Returns path or null. */
function findRepoConfig(start) {
  let dir = resolve(start || process.cwd());
  // Stop walking at the filesystem root or after 32 hops.
  for (let i = 0; i < 32; i++) {
    const candidate = join(dir, 'htmd.config.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Shallow + one-level deep merge for our flat-ish config shape. */
function mergeLayer(base, layer) {
  if (!layer || typeof layer !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(layer)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = { ...base[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function applyEnv(config, env) {
  const next = { ...config, routing: { ...config.routing } };
  if (env.HTMD_LENGTH_THRESHOLD) {
    const n = Number(env.HTMD_LENGTH_THRESHOLD);
    if (Number.isFinite(n) && n > 0) next.routing.lengthThreshold = n;
  }
  if (env.HTMD_FENCED_MIN_LINES) {
    const n = Number(env.HTMD_FENCED_MIN_LINES);
    if (Number.isFinite(n) && n > 0) next.routing.fencedBlockMinLines = n;
  }
  if (env.HTMD_DEFAULT_TRANSPORT) {
    next.routing.defaultTransport = env.HTMD_DEFAULT_TRANSPORT;
  }
  return next;
}

/**
 * Load the merged htmd config.
 *
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, globalPath?: string }} opts
 * @returns {{ config: object, layers: { defaults: object, global?: string, repo?: string, env: boolean } }}
 */
export function loadConfig(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const env = opts.env || process.env;
  const globalPath = opts.globalPath || join(homedir(), '.htmd', 'config.json');

  let config = { ...DEFAULTS, routing: { ...DEFAULTS.routing } };
  const layers = { defaults: { ...DEFAULTS } };

  if (existsSync(globalPath)) {
    const g = readJsonSafe(globalPath);
    if (g) {
      config = mergeLayer(config, g);
      layers.global = globalPath;
    }
  }

  const repoPath = findRepoConfig(cwd);
  if (repoPath) {
    const r = readJsonSafe(repoPath);
    if (r) {
      config = mergeLayer(config, r);
      layers.repo = repoPath;
    }
  }

  config = applyEnv(config, env);
  layers.env = true;

  return { config, layers };
}
