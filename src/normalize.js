// src/normalize.js — input normalization for htmd Phase 3.
//
// Takes whatever the agent emits (Markdown, Telegram-flavored HTML, or
// plain text) and canonicalizes to CommonMark Markdown. This is the
// single entry point every routing decision starts from.
//
// Detection is intentionally cheap and deterministic. We are not trying
// to win a sniff contest; we are trying to never regress the 2026-05-12
// incident where literal `<code>v0.4.0</code>` tags hit chat.
//
// v0.6: also extracts agent-side intent metadata. Agents may emit
// directives in either of two forms; both are stripped from the
// canonical output and surfaced as a `metadata` object on the result:
//
//   1. HTML comment:  <!-- htmd: needs-approval -->
//                     <!-- htmd: priority=high -->
//   2. Fenced block:  ```htmd-meta
//                     needs-approval: true
//                     priority: high
//                     ```
//
// See docs/PHASE3_DESIGN.md §Agent-side intent metadata.

import { htmlToMd } from './html2md.js';

// Tag subset that Telegram (and most chat surfaces) actually render.
// If the input is dominated by these, treat it as Telegram-HTML and
// turndown it. We do NOT try to handle arbitrary HTML here; templates
// are responsible for that on the rendering side.
const TG_TAG_RE = /<\/?(?:b|strong|i|em|u|s|strike|del|code|pre|a|br|tg-spoiler|blockquote)\b[^>]*>/i;

// Markdown signals: ATX headings, GFM tables, fenced blocks, links,
// list markers, emphasis. Any one of these strongly indicates Markdown.
const MD_SIGNALS = [
  /^#{1,6}\s+\S/m,         // # heading
  /^\|[^\n]+\|\s*$/m,      // | a | b | row
  /^```/m,                  // fenced code
  /\[[^\]]+\]\([^)]+\)/,   // [text](url)
  /^\s*[-*+]\s+\S/m,       // list bullet
  /\*\*\S[^*]*\S\*\*/      // **bold**
];

// htmd-meta fenced block: ```htmd-meta ... ```
const FENCED_META_RE = /^[ \t]*```htmd-meta[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm;
// htmd intent comment: <!-- htmd: directive[=value] -->
const COMMENT_META_RE = /<!--[ \t]*htmd:\s*([^\n>][^>]*?)\s*-->/g;

/**
 * Detect the input format without parsing it.
 *
 * @param {string} input
 * @returns {'markdown' | 'telegram-html' | 'plain'}
 */
export function detectInputFormat(input) {
  if (input == null) return 'plain';
  const s = String(input);
  if (TG_TAG_RE.test(s)) {
    // Telegram-flavored HTML wins over Markdown signals only when the
    // tags appear *outside* a fenced code block (i.e., real markup, not
    // an example of how to write tags). Cheap check: strip fenced
    // blocks and re-test.
    const stripped = s.replace(/```[\s\S]*?```/g, '');
    if (TG_TAG_RE.test(stripped)) return 'telegram-html';
  }
  for (const re of MD_SIGNALS) {
    if (re.test(s)) return 'markdown';
  }
  return 'plain';
}

/**
 * Normalize an agent message to canonical CommonMark Markdown and
 * extract any embedded htmd intent metadata.
 *
 * @param {string} input
 * @param {{ hint?: 'markdown' | 'telegram-html' | 'plain' }} opts
 * @returns {{
 *   markdown: string,
 *   format: 'markdown' | 'telegram-html' | 'plain',
 *   chars: number,
 *   metadata: Record<string, string | number | boolean>
 * }}
 */
export function normalize(input, opts = {}) {
  if (input == null) {
    return { markdown: '', format: 'plain', chars: 0, metadata: {} };
  }
  const raw = String(input);
  const format = opts.hint || detectInputFormat(raw);

  let markdown;
  if (format === 'telegram-html') {
    // turndown handles <b>, <i>, <code>, <pre>, <a>, etc. fine. The
    // 2026-05-12 incident was literal tags getting HTML-escaped *into*
    // the chat surface; turndown converts them back to Markdown so the
    // downstream renderer can emit clean HTML.
    markdown = htmlToMd(raw).trim() + (raw.endsWith('\n') ? '\n' : '');
  } else if (format === 'markdown') {
    markdown = raw;
  } else {
    // Plain text: wrap as-is. We do not auto-escape Markdown specials
    // because the downstream renderer treats this as CommonMark, and
    // CommonMark on plain prose is a no-op anyway.
    markdown = raw;
  }

  const { markdown: stripped, metadata } = extractMetadata(markdown);

  return {
    markdown: stripped,
    format,
    chars: stripped.length,
    metadata
  };
}

/**
 * Extract htmd intent metadata from a Markdown string. Strips the
 * source directives and returns the cleaned Markdown plus a metadata
 * object. Unknown directives are preserved in the metadata object as
 * given (forward-compatibility for v0.7+ keys).
 *
 * Value parsing for both forms:
 *   - `true` / `false` (case-sensitive) → boolean
 *   - integer literal → Number
 *   - decimal literal → Number
 *   - "quoted" or 'quoted' → string with quotes stripped
 *   - bare directive (no `=`/`:` value) → `true`
 *   - everything else → string as-given
 *
 * @param {string} md
 * @returns {{ markdown: string, metadata: Record<string, any> }}
 */
export function extractMetadata(md) {
  const metadata = {};
  if (!md) return { markdown: md ?? '', metadata };

  let out = md.replace(FENCED_META_RE, (_match, body) => {
    parseFencedBody(body, metadata);
    return '';
  });

  out = out.replace(COMMENT_META_RE, (_match, directive) => {
    parseCommentDirective(directive.trim(), metadata);
    return '';
  });

  // Collapse blank lines opened up by stripping, but preserve a single
  // blank line for paragraph breaks.
  out = out.replace(/\n{3,}/g, '\n\n');
  // Trim a leading blank that appears because we stripped a leading
  // metadata block.
  out = out.replace(/^\s*\n/, '');

  return { markdown: out, metadata };
}

function parseFencedBody(body, metadata) {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) {
      // Bare key on its own line → boolean true.
      metadata[line] = true;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (!key) continue;
    metadata[key] = parseValue(val);
  }
}

function parseCommentDirective(directive, metadata) {
  // A single comment can hold multiple directives separated by `;`.
  // e.g. <!-- htmd: needs-approval; priority=high -->
  for (const part of directive.split(';')) {
    const item = part.trim();
    if (!item) continue;
    const eqIdx = item.indexOf('=');
    if (eqIdx < 0) {
      metadata[item] = true;
      continue;
    }
    const key = item.slice(0, eqIdx).trim();
    const val = item.slice(eqIdx + 1).trim();
    if (!key) continue;
    metadata[key] = parseValue(val);
  }
}

function parseValue(v) {
  if (v === '') return true; // `key:` with no value → true
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}
