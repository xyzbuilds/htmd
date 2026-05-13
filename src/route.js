// src/route.js — routing decision for htmd Phase 3.
//
// Deterministic 6-rule router. Given a normalized message and optional
// intent flags, decides whether the agent's reply should go inline (let
// the harness deliver as plain chat) or as an interactive htmd page.
//
// Rules (in order, first-match wins):
//   1. --prefer-inline → inline
//   2. --needs-approval → page
//   3. --prefer-page → page
//   4. Contains Markdown table OR fenced code block with >= N lines → page
//   5. chars > lengthThreshold → page
//   6. Otherwise → inline (reason: below-thresholds)
//
// See docs/PHASE3_DESIGN.md §Routing.

import { loadConfig } from './config.js';
import { normalize } from './normalize.js';

const TABLE_RE = /^\s*\|[^\n]+\|\s*\n\s*\|[\s\-:|]+\|\s*$/m;
const FENCED_RE = /^```[^\n]*\n([\s\S]*?)\n```/gm;

/** Detect a GFM table (header + separator). */
function hasMarkdownTable(md) {
  return TABLE_RE.test(md);
}

/** Detect a fenced code block with at least `minLines` content lines. */
function hasLongFencedBlock(md, minLines) {
  let m;
  FENCED_RE.lastIndex = 0;
  while ((m = FENCED_RE.exec(md))) {
    const lines = m[1].split('\n').length;
    if (lines >= minLines) return true;
  }
  return false;
}

/**
 * Decide where an agent reply should go.
 *
 * @param {string} input — already-normalized Markdown (or any string;
 *   if you pass un-normalized input, the router will normalize it).
 * @param {{
 *   lengthThreshold?: number,
 *   fencedBlockMinLines?: number,
 *   needsApproval?: boolean,
 *   preferInline?: boolean,
 *   preferPage?: boolean,
 *   config?: object,
 *   alreadyNormalized?: boolean
 * }} opts
 * @returns {{
 *   action: 'inline' | 'page',
 *   reason: string,
 *   input: { format: string, chars: number },
 *   rendered: null
 * }}
 */
export function route(input, opts = {}) {
  const cfg = opts.config || loadConfig().config;
  const lengthThreshold = opts.lengthThreshold ?? cfg.routing.lengthThreshold;
  const fencedMin = opts.fencedBlockMinLines ?? cfg.routing.fencedBlockMinLines;

  const norm = opts.alreadyNormalized
    ? { markdown: String(input ?? ''), format: 'markdown', chars: String(input ?? '').length }
    : normalize(input);

  const meta = {
    input: { format: norm.format, chars: norm.chars },
    rendered: null
  };

  // Rule 1: explicit inline preference wins over everything.
  if (opts.preferInline) {
    return { action: 'inline', reason: 'prefer-inline', ...meta };
  }
  // Rule 2: approval intent → page (transport gets to render a reply control).
  if (opts.needsApproval) {
    return { action: 'page', reason: 'intent:needs-approval', ...meta };
  }
  // Rule 3: explicit page preference.
  if (opts.preferPage) {
    return { action: 'page', reason: 'prefer-page', ...meta };
  }
  // Rule 4: structural — table or long fenced block.
  if (hasMarkdownTable(norm.markdown)) {
    return { action: 'page', reason: 'contains-table', ...meta };
  }
  if (hasLongFencedBlock(norm.markdown, fencedMin)) {
    return { action: 'page', reason: 'contains-fenced', ...meta };
  }
  // Rule 5: length.
  if (norm.chars > lengthThreshold) {
    return { action: 'page', reason: 'length>threshold', ...meta };
  }
  // Rule 6: default → inline.
  return { action: 'inline', reason: 'below-thresholds', ...meta };
}

/**
 * Render the routing decision (if action === 'page') via a transport.
 *
 * On `transport.publish()` failure, falls back to inline with a one-line
 * `(htmd page failed: …)` prefix per the v0.5.0-alpha decision.
 *
 * @param {ReturnType<route>} decision
 * @param {string} normalizedMd
 * @param {import('./transports/index.js').HtmdTransport} transport
 * @param {{ slug?: string, meta?: Record<string,string>, renderer: (md: string) => string }} opts
 */
export async function applyDecision(decision, normalizedMd, transport, opts = {}) {
  if (decision.action === 'inline') return decision;
  if (!transport) return decision;

  const slug = opts.slug || 'reply';
  const meta = opts.meta || {};
  let renderedHtml;
  try {
    renderedHtml = opts.renderer ? opts.renderer(normalizedMd) : normalizedMd;
  } catch (e) {
    return fallback(decision, normalizedMd, `render failed: ${e.message}`);
  }

  try {
    const { id, url, submitEndpoint } = await transport.publish({
      slug,
      renderedHtml,
      markdown: normalizedMd,
      meta
    });
    return {
      ...decision,
      rendered: { id, url, submitEndpoint, transport: transport.name }
    };
  } catch (e) {
    return fallback(decision, normalizedMd, e.message || String(e));
  }
}

function fallback(decision, normalizedMd, errMessage) {
  const oneLine = String(errMessage).replace(/\s+/g, ' ').trim().slice(0, 200);
  return {
    ...decision,
    action: 'inline',
    reason: 'transport-failure',
    error: oneLine,
    inlinePrefix: `(htmd page failed: ${oneLine})`,
    inlineBody: normalizedMd
  };
}
