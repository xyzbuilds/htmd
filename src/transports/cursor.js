// src/transports/cursor.js — Phase 3 transport for Cursor IDE.
//
// Cursor exposes custom MCP (Model Context Protocol) servers via stdio. The
// "real" integration here is a htmd MCP server slated for v0.8.0 that Cursor
// would launch as a child process and address turn-by-turn. v0.7.0 is the
// adapter shape: a transport that publishes pages locally and delivers
// submissions back into the active Cursor chat panel.
//
// Until the htmd MCP server lands, delivery is stubbed behind a small set
// of pluggable modes that mirror `cowork-mcp` (file / http / noop). When
// the MCP wire is ready, the only edit required is swapping the body of
// the `mcp` mode (or adding it; see `_deliver` override below). The
// transport contract above the stub does not change.
//
// Delivery modes (selected via HTMD_CURSOR_DELIVERY):
//   - `file` (default) — append the submission as newline-JSON to
//     ~/.htmd/cursor/inbox.jsonl. A sidecar tails this file and
//     replays submissions into the addressed Cursor session (a small
//     companion Cursor extension or the htmd MCP server, when wired).
//   - `http`           — POST the submission to HTMD_CURSOR_MCP_URL.
//                        Stand-in for the eventual MCP control call.
//   - `noop`           — log + return ok; useful for smoke tests.
//
// Session addressing: Cursor workspaces are addressed by `sessionId`
// (sourced from explicit `deliver()` arg → HTMD_CURSOR_SESSION_ID env).
// `meta.cursorSessionId` and `meta.cursorWorkspace` populate the publish
// envelope so the harness can include them in any chat-side artifact.
//
// Tests substitute the delivery call site by passing a `_deliver`
// override to `createCursorTransport()`. The default export is the
// instance registered with the global transport registry.

import { mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { defaultRenderDir } from '../serve.js';
import { publishRender, publicHost } from '../serve-helpers.js';
import { registerTransport } from './registry.js';

const DEFAULT_INBOX = join(homedir(), '.htmd', 'cursor', 'inbox.jsonl');

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function sessionFromMeta(meta, env) {
  return (meta && meta.cursorSessionId) || env.HTMD_CURSOR_SESSION_ID || '';
}

function workspaceFromMeta(meta, env) {
  return (meta && meta.cursorWorkspace) || env.HTMD_CURSOR_WORKSPACE || '';
}

async function deliverViaFile({ id, action, payload, sessionId, workspace, inboxPath }) {
  ensureDir(resolve(inboxPath, '..'));
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    id,
    sessionId,
    workspace,
    action,
    payload
  }) + '\n';
  appendFileSync(inboxPath, line);
  return { ok: true, detail: `appended to ${inboxPath}` };
}

async function deliverViaHttp({ id, action, payload, sessionId, workspace, url, token }) {
  if (!url) {
    return { ok: false, detail: 'http delivery requires HTMD_CURSOR_MCP_URL' };
  }
  const body = JSON.stringify({ id, sessionId, workspace, action, payload });
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (e) {
    return { ok: false, detail: `cursor http error: ${e.message}` };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, detail: `cursor http ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, detail: `posted to ${url}` };
}

/**
 * Build a cursor transport instance. The exported `cursorTransport`
 * uses default env wiring; tests construct their own with `_deliver` or
 * `inboxPath` overrides.
 *
 * @param {{
 *   inboxPath?: string,
 *   env?: NodeJS.ProcessEnv,
 *   _deliver?: (submission: { id: string, action: string, payload: unknown, sessionId: string, workspace: string }) => Promise<{ ok: boolean, detail?: string }>,
 *   _publishRender?: typeof publishRender
 * }} opts
 */
export function createCursorTransport(opts = {}) {
  const env = opts.env || process.env;
  const inboxPath = opts.inboxPath || env.HTMD_CURSOR_INBOX || DEFAULT_INBOX;
  const _publish = opts._publishRender || publishRender;

  async function defaultDeliver(submission) {
    const mode = (env.HTMD_CURSOR_DELIVERY || 'file').toLowerCase();
    if (mode === 'noop') {
      return { ok: true, detail: 'noop' };
    }
    if (mode === 'http') {
      return deliverViaHttp({
        ...submission,
        url: env.HTMD_CURSOR_MCP_URL || '',
        token: env.HTMD_CURSOR_MCP_TOKEN || ''
      });
    }
    return deliverViaFile({ ...submission, inboxPath });
  }

  const _deliver = opts._deliver || defaultDeliver;

  return {
    name: 'cursor',

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
      const workspace = workspaceFromMeta(meta, env);
      return {
        id,
        url: viewUrl,
        submitEndpoint: submitUrl,
        file,
        // Cursor-flavored envelope the adapter hands to its harness. The
        // sessionId addresses a specific Cursor chat; workspace points at
        // the Cursor project the submission belongs to. Either may be empty
        // until the htmd MCP server lands and provides authoritative ids.
        cursorSession: sessionId || null,
        cursorWorkspace: workspace || null
      };
    },

    async deliver({ id, action, payload, sessionId, workspace }) {
      const effectiveSession = sessionId || env.HTMD_CURSOR_SESSION_ID || '';
      const effectiveWorkspace = workspace || env.HTMD_CURSOR_WORKSPACE || '';
      return _deliver({
        id,
        action,
        payload,
        sessionId: effectiveSession,
        workspace: effectiveWorkspace
      });
    },

    // Exposed for the cursor adapter + tests; not part of the contract.
    _inboxPath: inboxPath
  };
}

export const cursorTransport = createCursorTransport();

registerTransport(cursorTransport);
