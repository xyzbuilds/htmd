// src/transports/cowork-mcp.js — Phase 3 transport for Anthropic Cowork.
//
// Cowork is Anthropic's multi-user collaborative product; cowork-mcp is
// the MCP server interface to it. htmd's job at this layer is to publish
// a rendered page locally and deliver user submissions back into the
// active Cowork session as a regular user turn.
//
// The concrete cowork-mcp wire format is not yet public (2026-05-19), so
// this transport ships with a stubbed delivery call site that can be
// swapped for the real MCP request once the spec stabilizes. The shape
// of the transport contract — publish returns an envelope, deliver
// returns `{ ok, detail? }` — is what v0.5.0-beta is validating; the
// underlying wire is intentionally pluggable.
//
// Delivery modes (selected via HTMD_COWORK_DELIVERY):
//   - `file` (default) — append the submission as newline-JSON to
//     ~/.htmd/cowork/inbox.jsonl. A local sidecar (or the cowork-mcp
//     server itself, when wired) tails this file and injects each
//     submission as a user turn in the addressed session.
//   - `http`           — POST the submission to HTMD_COWORK_MCP_URL.
//                        Stand-in for the eventual MCP control call.
//   - `noop`           — log + return ok; useful for smoke tests.
//
// Tests can substitute the delivery call site by passing a `_deliver`
// override to `createCoworkMcpTransport()`. The default export is the
// instance registered with the global transport registry.

import { mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { defaultRenderDir } from '../serve.js';
import { publishRender, publicHost } from '../serve-helpers.js';
import { registerTransport } from './registry.js';

const DEFAULT_INBOX = join(homedir(), '.htmd', 'cowork', 'inbox.jsonl');

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function sessionFromMeta(meta, env) {
  return (meta && meta.coworkSessionId) || env.HTMD_COWORK_SESSION_ID || '';
}

async function deliverViaFile({ id, action, payload, sessionId, inboxPath }) {
  ensureDir(resolve(inboxPath, '..'));
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    id,
    sessionId,
    action,
    payload
  }) + '\n';
  appendFileSync(inboxPath, line);
  return { ok: true, detail: `appended to ${inboxPath}` };
}

async function deliverViaHttp({ id, action, payload, sessionId, url, token }) {
  if (!url) {
    return { ok: false, detail: 'http delivery requires HTMD_COWORK_MCP_URL' };
  }
  const body = JSON.stringify({ id, sessionId, action, payload });
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (e) {
    return { ok: false, detail: `cowork-mcp http error: ${e.message}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, detail: `cowork-mcp http ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, detail: `posted to ${url}` };
}

/**
 * Build a cowork-mcp transport instance. The exported `coworkMcpTransport`
 * uses default env wiring; tests construct their own with `_deliver` or
 * `inboxPath` overrides.
 *
 * @param {{
 *   inboxPath?: string,
 *   env?: NodeJS.ProcessEnv,
 *   _deliver?: (submission: { id: string, action: string, payload: unknown, sessionId: string }) => Promise<{ ok: boolean, detail?: string }>,
 *   _publishRender?: typeof publishRender
 * }} opts
 */
export function createCoworkMcpTransport(opts = {}) {
  const env = opts.env || process.env;
  const inboxPath = opts.inboxPath || env.HTMD_COWORK_INBOX || DEFAULT_INBOX;
  const _publish = opts._publishRender || publishRender;

  async function defaultDeliver(submission) {
    const mode = (env.HTMD_COWORK_DELIVERY || 'file').toLowerCase();
    if (mode === 'noop') {
      return { ok: true, detail: 'noop' };
    }
    if (mode === 'http') {
      return deliverViaHttp({
        ...submission,
        url: env.HTMD_COWORK_MCP_URL || '',
        token: env.HTMD_COWORK_MCP_TOKEN || ''
      });
    }
    return deliverViaFile({ ...submission, inboxPath });
  }

  const _deliver = opts._deliver || defaultDeliver;

  return {
    name: 'cowork-mcp',

    async publish({ slug, renderedHtml, markdown, meta }) {
      const dir = defaultRenderDir();
      ensureDir(dir);
      const host = publicHost();
      const { id, file, viewUrl, submitUrl } = _publish({
        html: renderedHtml,
        slug: slug || (meta && meta.slug) || 'reply',
        dir,
        host
      });
      const sessionId = sessionFromMeta(meta, env);
      return {
        id,
        url: viewUrl,
        submitEndpoint: submitUrl,
        file,
        // Cowork-flavored envelope the adapter hands to its harness so the
        // session knows which conversation the page belongs to. The real
        // mcp surface will likely require this id to address the turn.
        coworkSession: sessionId || null
      };
    },

    async deliver({ id, action, payload, sessionId }) {
      const effectiveSession = sessionId || env.HTMD_COWORK_SESSION_ID || '';
      return _deliver({ id, action, payload, sessionId: effectiveSession });
    },

    // Exposed for the cowork adapter + tests; not part of the contract.
    _inboxPath: inboxPath
  };
}

export const coworkMcpTransport = createCoworkMcpTransport();

registerTransport(coworkMcpTransport);
