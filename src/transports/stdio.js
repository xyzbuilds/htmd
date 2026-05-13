// src/transports/stdio.js — reference transport.
//
// Publishes by writing the rendered HTML to ~/.htmd/renders/<id>.html
// and printing the local URL on stdout. Replies are appended as
// newline-delimited JSON to ~/.htmd/replies/stdio.jsonl, which an agent
// (or a shell tail) can watch.
//
// This is the "boring, predictable" transport every other transport is
// graded against. If the abstraction can't model stdio, it can't model
// anything.

import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { defaultRenderDir } from '../serve.js';
import { publishRender, publicHost } from '../serve-helpers.js';
import { registerTransport } from './registry.js';

const DEFAULT_REPLY_LOG = join(homedir(), '.htmd', 'replies', 'stdio.jsonl');

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export const stdioTransport = {
  name: 'stdio',

  async publish({ slug, renderedHtml, markdown, meta }) {
    const dir = defaultRenderDir();
    ensureDir(dir);
    const host = publicHost();
    const { id, file, viewUrl, submitUrl } = publishRender({
      html: renderedHtml,
      slug: slug || (meta && meta.slug) || 'reply',
      dir,
      host
    });
    return { id, url: viewUrl, submitEndpoint: submitUrl, file };
  },

  async deliver({ id, action, payload }) {
    ensureDir(resolve(DEFAULT_REPLY_LOG, '..'));
    const line = JSON.stringify({ ts: new Date().toISOString(), id, action, payload }) + '\n';
    appendFileSync(DEFAULT_REPLY_LOG, line);
    return { ok: true, detail: `appended to ${DEFAULT_REPLY_LOG}` };
  },

  // Exposed for the OpenClaw adapter + tests; not part of the contract.
  _replyLog: DEFAULT_REPLY_LOG
};

registerTransport(stdioTransport);
