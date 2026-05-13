// src/normalize.js — input normalization for htmd Phase 3.
//
// Takes whatever the agent emits (Markdown, Telegram-flavored HTML, or
// plain text) and canonicalizes to CommonMark Markdown. This is the
// single entry point every routing decision starts from.
//
// Detection is intentionally cheap and deterministic. We are not trying
// to win a sniff contest; we are trying to never regress the 2026-05-12
// incident where literal `<code>v0.4.0</code>` tags hit chat.

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
 * Normalize an agent message to canonical CommonMark Markdown.
 *
 * @param {string} input
 * @param {{ hint?: 'markdown' | 'telegram-html' | 'plain' }} opts
 * @returns {{ markdown: string, format: 'markdown' | 'telegram-html' | 'plain', chars: number }}
 */
export function normalize(input, opts = {}) {
  if (input == null) {
    return { markdown: '', format: 'plain', chars: 0 };
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

  return {
    markdown,
    format,
    chars: markdown.length
  };
}
