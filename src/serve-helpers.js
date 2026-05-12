// serve-helpers.js — helpers used by `htmd compose --serve` and
// `htmd render --serve` to publish renders into the local serve directory.

import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { defaultRenderDir } from './serve.js';

export const DEFAULT_TAILSCALE_IP = '100.70.189.117';

/**
 * Compute the public host the served URL should use. Order:
 *   1. opts.host
 *   2. HTMD_PUBLIC_HOST env
 *   3. HTMD_TAILSCALE_IP env (+ port)
 *   4. fallback to DEFAULT_TAILSCALE_IP (Mac Studio)
 */
export function publicHost(opts = {}, env = process.env) {
  if (opts.host) return opts.host;
  if (env.HTMD_PUBLIC_HOST) return env.HTMD_PUBLIC_HOST;
  const ip = env.HTMD_TAILSCALE_IP || DEFAULT_TAILSCALE_IP;
  const port = opts.port || env.HTMD_PORT || '8787';
  return `http://${ip}:${port}`;
}

/** Make a slug-id like "sprint-review-x9q8z" from a candidate name. */
export function makeRenderId(name) {
  const slug = String(name || 'page')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'page';
  const short = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${slug}-${short}`;
}

/**
 * Inject the submit endpoint meta tag and helper script into a rendered HTML
 * page so the compose-mode FAB can find it.
 *
 *   <meta name="htmd-submit" content="http://.../submit/<id>">
 *   <meta name="htmd-render-id" content="<id>">
 */
export function injectSubmitMeta(html, { submitUrl, renderId, viewUrl }) {
  const tags = [
    `<meta name="htmd-submit" content="${escape(submitUrl)}">`,
    `<meta name="htmd-render-id" content="${escape(renderId)}">`,
    viewUrl ? `<meta name="htmd-view-url" content="${escape(viewUrl)}">` : ''
  ].filter(Boolean).join('\n');
  // Insert just before </head> (case-insensitive). Fallback: prepend to <body>.
  const headRe = /<\/head>/i;
  if (headRe.test(html)) return html.replace(headRe, `${tags}\n</head>`);
  return tags + '\n' + html;
}

/** Write an HTML render to disk; returns { id, file, submitUrl, viewUrl }. */
export function publishRender({ html, slug, dir, host }) {
  const renderDir = resolve(dir || defaultRenderDir());
  if (!existsSync(renderDir)) mkdirSync(renderDir, { recursive: true });
  const id = makeRenderId(slug);
  const submitUrl = `${host}/submit/${id}`;
  const viewUrl = `${host}/r/${id}`;
  const augmented = injectSubmitMeta(html, { submitUrl, renderId: id, viewUrl });
  const file = join(renderDir, `${id}.html`);
  writeFileSync(file, augmented);
  return { id, file, submitUrl, viewUrl };
}

/** Delete renders older than ttlDays from dir. Returns number removed. */
export function cleanupOldRenders(dir, ttlDays = 7) {
  const renderDir = resolve(dir || defaultRenderDir());
  if (!existsSync(renderDir)) return 0;
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const f of readdirSync(renderDir)) {
    if (!f.endsWith('.html')) continue;
    const p = join(renderDir, f);
    try {
      const st = statSync(p);
      if (st.mtime.getTime() < cutoff) {
        unlinkSync(p);
        n++;
      }
    } catch {
      // ignore
    }
  }
  return n;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
