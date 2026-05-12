// extract.js — pull structured state out of an htmd-rendered HTML file.
//
// Why this exists: closes the bidirectional loop. After the human interacts
// with a kanban board (moving cards) or feedback-corrector (changing labels)
// in the browser, the agent can re-ingest the resulting state with
// `htmd extract <file.html>` to learn what changed.
//
// We look for two kinds of embedded state:
//   1. <script type="application/json" data-htmd-state="...">{...}</script>
//      The new convention: any state worth extracting opts in by adding
//      `data-htmd-state="<template-or-block-name>"`.
//   2. Legacy per-template attributes (`data-fc-state`, `data-kb-state`,
//      `data-cl-state`, etc.) — kept so existing rendered files still work.
//
// We do NOT execute the page. This is pure HTML parsing.

const SCRIPT_RE =
  /<script\b([^>]*?)\btype=["']application\/json["']([^>]*)>([\s\S]*?)<\/script>/gi;

// Matches either `name="val"` / `name='val'` / `name=bare` OR a bare `name`
// (boolean attribute with no value). Boolean attrs come back with empty string.
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`<>]+)))?/g;

const LEGACY_STATE_ATTRS = [
  'data-fc-state', // feedback-corrector
  'data-kb-state', // kanban-board
  'data-cl-state', // checklist
  'data-qa-state', // q-and-a
  'data-al-state', // approval-list
  'data-rk-state', // rank-order
  'data-tr-state', // text-redline
  'data-ss-state', // selection-set
  'data-pm-state'  // priority-matrix
];

export function extractState(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  SCRIPT_RE.lastIndex = 0;
  let m;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const beforeAttrs = m[1] || '';
    const afterAttrs = m[2] || '';
    const body = (m[3] || '').trim();
    if (!body) continue;
    const allAttrs = parseAttrs(beforeAttrs + ' ' + afterAttrs);
    let kind = allAttrs['data-htmd-state'];
    let blockName = null;
    if (!kind) {
      // Try legacy attrs
      for (const a of LEGACY_STATE_ATTRS) {
        if (a in allAttrs) {
          kind = a.replace(/^data-/, '').replace(/-state$/, '');
          break;
        }
      }
    } else {
      blockName = kind;
    }
    if (!kind) continue;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      out.push({ kind, error: 'Invalid JSON: ' + e.message, raw: body.slice(0, 200) });
      continue;
    }
    out.push({ kind, block: blockName || kind, state: parsed });
  }
  return out;
}

function parseAttrs(attrText) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(attrText)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    out[name] = val;
  }
  return out;
}
