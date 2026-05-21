// src/transports/webhook.js — Phase 3 generic webhook transport.
//
// The webhook transport is the "any agent that can receive a POST" path.
// It is intentionally the most uniform of all transports: there is no
// per-harness wire format, no MCP stub, no SSH side-channel. The
// receiver picks a URL, htmd POSTs the publish / deliver envelope to it
// as JSON, and treats the JSON response as the outcome.
//
// Config (layered — see src/config.js):
//   transports.webhook.url         (required)
//   transports.webhook.headers     (optional object, merged into request headers)
//   transports.webhook.timeout_ms  (default 10000)
//   transports.webhook.retries     (default 0 — retries on 5xx and network errors only)
//
// Env overrides:
//   HTMD_WEBHOOK_URL
//   HTMD_WEBHOOK_HEADERS           (JSON object, e.g. '{"Authorization":"Bearer …"}')
//   HTMD_WEBHOOK_TIMEOUT_MS
//   HTMD_WEBHOOK_RETRIES
//
// Wire shape:
//   publish → POST { op: 'publish', slug, renderedHtml, markdown, meta }
//             → 2xx JSON { id, url, submitEndpoint, ... } (returned to caller)
//             → 4xx                                       → throw 'webhook-4xx: …'
//             → 5xx (after retries)                       → throw 'webhook-5xx: …'
//             → timeout                                   → throw 'webhook-timeout'
//             → network/other error (after retries)       → throw 'webhook-error: …'
//
//   deliver → POST { op: 'deliver', id, action, payload }
//             → 2xx                            → { ok: true, detail }
//             → 4xx                            → { ok: false, reason: 'webhook-4xx', detail }
//             → 5xx (after retries)            → { ok: false, reason: 'webhook-5xx', detail }
//             → timeout                        → { ok: false, reason: 'webhook-timeout' }
//             → network/other error (after retries) → { ok: false, reason: 'webhook-error', detail }
//
// The asymmetry between publish (throws) and deliver (returns) matches
// the rest of the transport contract: publish failures need to flow
// through route.js's `applyDecision` fallback path (which catches
// exceptions and yields a `transport-failure` inline decision), while
// deliver returns its outcome directly to the caller.
//
// No external HTTP libs, no keep-alive pools, no retry library — just
// global fetch + a simple for-loop + AbortController for timeout.

import { registerTransport } from './registry.js';
import { loadConfig } from '../config.js';

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 0;

function parseHeadersEnv(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  return undefined;
}

function parseIntEnv(raw, fallback) {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function resolveConfig(opts) {
  const env = opts.env || process.env;
  const cfg = opts.config || (loadConfig({ env }).config);
  const webhookCfg = (cfg.transports && cfg.transports.webhook) || {};

  const url = opts.url ?? env.HTMD_WEBHOOK_URL ?? webhookCfg.url ?? '';
  const headers = opts.headers
    ?? parseHeadersEnv(env.HTMD_WEBHOOK_HEADERS)
    ?? webhookCfg.headers
    ?? {};
  const timeoutMs = opts.timeoutMs
    ?? parseIntEnv(env.HTMD_WEBHOOK_TIMEOUT_MS, undefined)
    ?? webhookCfg.timeout_ms
    ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries
    ?? parseIntEnv(env.HTMD_WEBHOOK_RETRIES, undefined)
    ?? webhookCfg.retries
    ?? DEFAULT_RETRIES;

  return { url, headers, timeoutMs, retries };
}

async function readBodySafe(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function snippet(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Perform a single POST with timeout. Returns one of:
 *   { kind: 'ok', status, body }      — 2xx
 *   { kind: 'client', status, body }  — 4xx (do not retry)
 *   { kind: 'server', status, body }  — 5xx (retryable)
 *   { kind: 'timeout' }               — aborted by timeout
 *   { kind: 'error', message }        — network or other fetch error (retryable)
 *
 * @param {string} url
 * @param {object} body
 * @param {object} headers
 * @param {number} timeoutMs
 * @param {typeof fetch} [fetchImpl]
 */
async function postOnce(url, body, headers, timeoutMs, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''))) {
      return { kind: 'timeout' };
    }
    return { kind: 'error', message: e && e.message ? e.message : String(e) };
  }
  clearTimeout(timer);

  const status = res.status;
  const text = await readBodySafe(res);
  if (status >= 200 && status < 300) return { kind: 'ok', status, body: text };
  if (status >= 400 && status < 500) return { kind: 'client', status, body: text };
  return { kind: 'server', status, body: text };
}

/**
 * Run postOnce with retries. Retries on `server` (5xx) and `error`
 * (network) outcomes. 4xx and timeout are NOT retried (4xx is a
 * permanent failure by contract; timeout means the receiver was given
 * its budget and missed it).
 *
 * @param {string} url
 * @param {object} body
 * @param {{ headers: object, timeoutMs: number, retries: number, fetchImpl?: typeof fetch, sleep?: (ms:number)=>Promise<void> }} cfg
 */
async function postWithRetries(url, body, cfg) {
  const total = (cfg.retries || 0) + 1;
  const sleep = cfg.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last;
  for (let attempt = 0; attempt < total; attempt++) {
    last = await postOnce(url, body, cfg.headers, cfg.timeoutMs, cfg.fetchImpl);
    if (last.kind === 'ok' || last.kind === 'client' || last.kind === 'timeout') {
      return last;
    }
    // server or error → retry if budget remains
    if (attempt < total - 1) {
      // Backoff: 50ms * (attempt+1). Deliberately small; the brief
      // forbids a retry library and asks for a simple loop. Tests
      // inject a no-op sleep to keep them fast.
      await sleep(50 * (attempt + 1));
    }
  }
  return last;
}

function parseJsonResponse(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Build a webhook transport instance. The exported `webhookTransport`
 * uses default env wiring; callers (and tests) may construct their own
 * with explicit options or a `_fetch` override.
 *
 * @param {{
 *   url?: string,
 *   headers?: Record<string, string>,
 *   timeoutMs?: number,
 *   retries?: number,
 *   env?: NodeJS.ProcessEnv,
 *   config?: object,
 *   _fetch?: typeof fetch,
 *   _sleep?: (ms: number) => Promise<void>
 * }} opts
 */
export function createWebhookTransport(opts = {}) {
  // Resolve config lazily at call time so env / config changes after
  // module load are honored. Tests construct with explicit opts.
  function resolve() {
    return resolveConfig(opts);
  }

  return {
    name: 'webhook',

    async publish({ slug, renderedHtml, markdown, meta }) {
      const { url, headers, timeoutMs, retries } = resolve();
      if (!url) {
        throw new Error('webhook-config: transports.webhook.url is required (or HTMD_WEBHOOK_URL)');
      }
      const envelope = {
        op: 'publish',
        slug: slug || (meta && meta.slug) || 'reply',
        renderedHtml: renderedHtml || '',
        markdown: markdown || '',
        meta: meta || {}
      };
      const outcome = await postWithRetries(url, envelope, {
        headers,
        timeoutMs,
        retries,
        fetchImpl: opts._fetch,
        sleep: opts._sleep
      });
      if (outcome.kind === 'ok') {
        const parsed = parseJsonResponse(outcome.body);
        if (!parsed.id || !parsed.url || !parsed.submitEndpoint) {
          throw new Error(`webhook-invalid-response: missing id/url/submitEndpoint in ${snippet(outcome.body)}`);
        }
        return {
          id: parsed.id,
          url: parsed.url,
          submitEndpoint: parsed.submitEndpoint,
          file: parsed.file,
          ...parsed
        };
      }
      if (outcome.kind === 'client') {
        throw new Error(`webhook-4xx: ${outcome.status} ${snippet(outcome.body)}`);
      }
      if (outcome.kind === 'server') {
        throw new Error(`webhook-5xx: ${outcome.status} ${snippet(outcome.body)}`);
      }
      if (outcome.kind === 'timeout') {
        throw new Error(`webhook-timeout: ${timeoutMs}ms`);
      }
      throw new Error(`webhook-error: ${snippet(outcome.message)}`);
    },

    async deliver({ id, action, payload }) {
      const { url, headers, timeoutMs, retries } = resolve();
      if (!url) {
        return {
          ok: false,
          reason: 'webhook-config',
          detail: 'transports.webhook.url is required (or HTMD_WEBHOOK_URL)'
        };
      }
      const envelope = { op: 'deliver', id, action, payload };
      const outcome = await postWithRetries(url, envelope, {
        headers,
        timeoutMs,
        retries,
        fetchImpl: opts._fetch,
        sleep: opts._sleep
      });
      if (outcome.kind === 'ok') {
        return { ok: true, detail: `posted to ${url}` };
      }
      if (outcome.kind === 'client') {
        return { ok: false, reason: 'webhook-4xx', detail: `${outcome.status} ${snippet(outcome.body)}` };
      }
      if (outcome.kind === 'server') {
        return { ok: false, reason: 'webhook-5xx', detail: `${outcome.status} ${snippet(outcome.body)}` };
      }
      if (outcome.kind === 'timeout') {
        return { ok: false, reason: 'webhook-timeout', detail: `${timeoutMs}ms` };
      }
      return { ok: false, reason: 'webhook-error', detail: snippet(outcome.message) };
    }
  };
}

export const webhookTransport = createWebhookTransport();

registerTransport(webhookTransport);
