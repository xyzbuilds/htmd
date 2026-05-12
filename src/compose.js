// compose.js — turn a Markdown file with embedded ```htmd:<template>``` fences
// into a single self-contained HTML page that interleaves prose with rendered
// template widgets.
//
// Why this exists: the user's vision is that an agent should write ONE markdown
// file mixing narrative + multiple interactive widgets (status report, kanban,
// feedback-corrector, etc.) and htmd produces a single shareable page. This
// closes the human-in-the-loop circle: the page also exposes a global "Copy
// all my changes" action that aggregates structured output from every
// interactive block back into one prompt the human can paste to the agent.

import { marked } from 'marked';
import YAML from 'yaml';
import { renderTemplateParts, wrapShell } from './render.js';
import { mdToHtml } from './md.js';
import { escapeHtml } from './html-tag.js';

const FENCE_LANG = /^htmd[:\s]+([a-zA-Z0-9_-]+)\s*(.*)$/;

/**
 * Parse a markdown source into an ordered list of segments:
 *   { type: 'prose', md: '...' }
 *   { type: 'block', template: 'status-report', data: {...}, raw: '...' }
 *
 * Recognised fences:
 *   ```htmd:<template>     (preferred)
 *   ```htmd <template>     (alt)
 */
export function parseSegments(mdText) {
  const tokens = marked.lexer(mdText);
  const segments = [];
  let proseBuffer = [];

  function flushProse() {
    if (proseBuffer.length === 0) return;
    const md = proseBuffer.map((t) => t.raw).join('');
    proseBuffer = [];
    if (md.trim()) segments.push({ type: 'prose', md });
  }

  for (const tok of tokens) {
    if (tok.type === 'code' && typeof tok.lang === 'string') {
      const m = FENCE_LANG.exec(tok.lang.trim());
      if (m) {
        flushProse();
        const template = m[1];
        const text = tok.text || '';
        let data;
        let parseError;
        try {
          data = parseFenceBody(text);
        } catch (e) {
          parseError = e.message;
          data = null;
        }
        segments.push({ type: 'block', template, data, raw: text, parseError });
        continue;
      }
    }
    proseBuffer.push(tok);
  }
  flushProse();
  return segments;
}

function parseFenceBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  // Try JSON first (more strict than YAML when input clearly looks like JSON).
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  return YAML.parse(trimmed);
}

/**
 * Compose a Markdown source into a single HTML document.
 *
 * Returns the HTML string and an array of any per-block errors (compose is
 * deliberately tolerant: a single bad block becomes an inline error card and
 * the rest of the page still renders).
 */
export async function composeFromMarkdown(mdText, opts = {}) {
  const segments = parseSegments(mdText);
  const cssByTemplate = new Map();
  const jsByTemplate = new Map();
  const blocksMeta = [];
  const errors = [];
  const bodyParts = [];
  let blockIdx = 0;

  for (const seg of segments) {
    if (seg.type === 'prose') {
      bodyParts.push(`<section class="htmd-prose">${mdToHtml(seg.md)}</section>`);
      continue;
    }
    if (seg.parseError) {
      errors.push({ template: seg.template, idx: blockIdx, error: seg.parseError });
      bodyParts.push(blockErrorCard(seg.template, blockIdx, `Could not parse YAML/JSON: ${seg.parseError}`, seg.raw));
      blockIdx++;
      continue;
    }
    try {
      const parts = await renderTemplateParts(seg.template, seg.data, opts);
      cssByTemplate.set(seg.template, parts.css);
      if (parts.js) jsByTemplate.set(seg.template, parts.js);
      blocksMeta.push({ template: seg.template, idx: blockIdx, title: parts.title });
      bodyParts.push(
        `<section class="htmd-block" data-htmd-block="${escapeHtml(seg.template)}" data-htmd-block-idx="${blockIdx}">${parts.body}</section>`
      );
    } catch (e) {
      errors.push({ template: seg.template, idx: blockIdx, error: e.message });
      bodyParts.push(blockErrorCard(seg.template, blockIdx, e.message, seg.raw));
    }
    blockIdx++;
  }

  const interactiveCount = jsByTemplate.size;
  const composeBridgeJs = interactiveCount > 0 ? COMPOSE_BRIDGE_JS : '';
  const composeBridgeUi = interactiveCount > 0 ? COMPOSE_BRIDGE_UI : '';

  const css = [COMPOSE_CSS, ...cssByTemplate.values()].join('\n');
  const js = [...jsByTemplate.values(), composeBridgeJs].filter(Boolean).join('\n;\n');
  const title = opts.title || extractFirstHeading(mdText) || 'htmd compose';

  const html = wrapShell({
    title,
    body: `<main class="htmd-compose">\n${bodyParts.join('\n')}\n${composeBridgeUi}\n</main>`,
    css,
    js,
    template: 'compose',
    lang: opts.lang || 'en'
  });

  return { html, errors, blocks: blocksMeta };
}

function blockErrorCard(template, idx, message, raw) {
  return `<section class="htmd-block-error" data-htmd-block="${escapeHtml(template)}" data-htmd-block-idx="${idx}" data-htmd-error>
  <header><strong>Template error</strong> &middot; <code>${escapeHtml(template)}</code></header>
  <p>${escapeHtml(message)}</p>
  <details><summary>Source</summary><pre>${escapeHtml(raw || '')}</pre></details>
</section>`;
}

function extractFirstHeading(md) {
  const m = /^#\s+(.+?)\s*$/m.exec(md);
  return m ? m[1] : null;
}

// CSS that wraps the composed page: prose styling, block separation, error card,
// and the global export FAB shown when interactive blocks are present.
const COMPOSE_CSS = `
.htmd-compose {
  max-width: 920px;
  margin: 0 auto;
  padding: 2rem 1.25rem 6rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}
.htmd-prose { line-height: 1.65; }
.htmd-prose > :first-child { margin-top: 0; }
.htmd-prose h1, .htmd-prose h2, .htmd-prose h3 { letter-spacing: -0.01em; line-height: 1.2; }
.htmd-prose h1 { font-size: 2rem; margin: 1.5rem 0 0.75rem; }
.htmd-prose h2 { font-size: 1.5rem; margin: 1.5rem 0 0.5rem; }
.htmd-prose h3 { font-size: 1.2rem; margin: 1.25rem 0 0.5rem; }
.htmd-prose p, .htmd-prose ul, .htmd-prose ol { margin: 0.75rem 0; }
.htmd-prose pre {
  background: var(--htmd-surface-2);
  padding: 1rem;
  border-radius: var(--htmd-radius-sm);
  overflow-x: auto;
  font-size: 0.9em;
}
.htmd-prose code {
  background: var(--htmd-surface-2);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.9em;
}
.htmd-prose pre code { background: none; padding: 0; }
.htmd-prose blockquote {
  border-left: 3px solid var(--htmd-accent);
  margin: 1rem 0;
  padding: 0.25rem 1rem;
  color: var(--htmd-fg-muted);
}
.htmd-prose table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.htmd-prose th, .htmd-prose td {
  border: 1px solid var(--htmd-border);
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.htmd-prose th { background: var(--htmd-surface-2); }

.htmd-block {
  position: relative;
  border-radius: var(--htmd-radius);
  border: 1px solid var(--htmd-border);
  background: var(--htmd-surface);
  box-shadow: var(--htmd-shadow);
  overflow: hidden;
}
.htmd-block > main:first-child,
.htmd-block > section:first-child,
.htmd-block > div:first-child { padding-top: 0; }
.htmd-block::before {
  content: attr(data-htmd-block);
  position: absolute;
  top: 0.6rem;
  right: 0.85rem;
  z-index: 5;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--htmd-muted);
  font-weight: 700;
  pointer-events: none;
}

/* In compose mode, per-template FABs (every interactive template has its
   own bottom-right fixed-position copy button) would all stack at the same
   viewport corner and overlap each other AND the global compose FAB. Hide
   them — the compose-level "Copy all changes" button below aggregates every
   block's export, so per-block FABs are redundant inside a composed page. */
.htmd-block .fc-fab,
.htmd-block .cl-fab,
.htmd-block .qa-fab,
.htmd-block .al-fab,
.htmd-block .rk-fab,
.htmd-block .tr-fab,
.htmd-block .pm-fab,
.htmd-block .dm-fab,
.htmd-block .cmp-fab,
.htmd-block .ed-fab,
.htmd-block .cr-fab {
  display: none !important;
}
/* Their modals are hidden by default; hiding the FAB suffices. The transient
   toasts these templates emit only fire on direct interaction with the FAB,
   so they won't appear either. */

/* The kanban-board's "Export Markdown" header buttons are NOT fixed-position
   FABs — they live inside the card. Leave them alone (still useful in compose). */
/* The data-table "Send edits back" button is in the card header, not a fixed
   FAB — leave it visible (it has its own modal). */
.htmd-block .dt-export-btn-edits { display: none !important; }
/* Same reasoning: edits flow through the global FAB. */

.htmd-block-error {
  border: 1px solid var(--htmd-danger);
  background: var(--htmd-danger-soft);
  border-radius: var(--htmd-radius);
  padding: 1rem 1.1rem;
  font-size: var(--htmd-text-sm);
  color: var(--htmd-fg);
}
.htmd-block-error header { font-size: var(--htmd-text-md); margin-bottom: 0.4rem; }
.htmd-block-error pre {
  background: var(--htmd-surface);
  padding: 0.6rem 0.8rem;
  border-radius: var(--htmd-radius-sm);
  font-size: 0.78rem;
  overflow-x: auto;
  margin-top: 0.4rem;
}

/* Compose-level export FAB */
.htmd-cx-fab {
  position: fixed;
  bottom: 1.1rem;
  left: 1.1rem;
  z-index: 90;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.65rem 1.1rem;
  background: var(--htmd-fg);
  color: var(--htmd-bg);
  border: none;
  border-radius: 999px;
  font-size: var(--htmd-text-sm);
  font-weight: 700;
  letter-spacing: 0.01em;
  box-shadow: var(--htmd-shadow-lg);
  cursor: pointer;
  transition: transform 0.12s, opacity 0.12s;
}
.htmd-cx-fab:hover { transform: translateY(-1px); }
.htmd-cx-fab:disabled, .htmd-cx-fab[aria-disabled="true"] { opacity: 0.55; cursor: not-allowed; }
.htmd-cx-fab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.4rem;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  font-size: var(--htmd-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.htmd-cx-modal {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.htmd-cx-modal[hidden] { display: none; }
.htmd-cx-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}
.htmd-cx-modal-panel {
  position: relative;
  background: var(--htmd-surface);
  border: 1px solid var(--htmd-border);
  border-radius: var(--htmd-radius);
  box-shadow: var(--htmd-shadow-lg);
  width: 100%;
  max-width: 720px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.htmd-cx-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--htmd-border);
}
.htmd-cx-modal-head h2 { font-size: var(--htmd-text-lg); font-weight: 700; }
.htmd-cx-modal-x {
  background: transparent;
  border: none;
  font-size: 1.1rem;
  color: var(--htmd-fg-muted);
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: 999px;
}
.htmd-cx-modal-x:hover { background: var(--htmd-surface-2); }
.htmd-cx-modal-pre {
  margin: 0;
  padding: 1rem 1.1rem;
  background: var(--htmd-surface-2);
  font-family: var(--htmd-font-mono);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  flex: 1;
  color: var(--htmd-fg);
}
.htmd-cx-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--htmd-border);
  background: var(--htmd-surface);
}
.htmd-cx-btn {
  min-height: 40px;
  padding: 0.5rem 1rem;
  border-radius: var(--htmd-radius-sm);
  font-size: var(--htmd-text-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
.htmd-cx-btn-ghost { background: transparent; color: var(--htmd-fg-muted); border-color: var(--htmd-border); }
.htmd-cx-btn-ghost:hover { background: var(--htmd-surface-2); }
.htmd-cx-btn-primary { background: var(--htmd-accent); color: var(--htmd-accent-fg); }
.htmd-cx-btn-primary:hover { filter: brightness(1.05); }

.htmd-cx-toast {
  position: fixed;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--htmd-fg);
  color: var(--htmd-bg);
  padding: 0.55rem 1rem;
  border-radius: var(--htmd-radius-sm);
  font-size: var(--htmd-text-sm);
  font-weight: 600;
  box-shadow: var(--htmd-shadow-lg);
  z-index: 250;
  opacity: 0;
  transition: opacity 0.18s;
  pointer-events: none;
}
.htmd-cx-toast[hidden] { display: none; }
.htmd-cx-toast.htmd-cx-toast-show { opacity: 1; }

@media (max-width: 560px) {
  .htmd-compose { padding: 1.25rem 0.85rem 7rem; gap: 1.25rem; }
  .htmd-cx-fab { left: 1rem; right: 1rem; justify-content: center; border-radius: var(--htmd-radius); }
}

@media print {
  .htmd-cx-fab, .htmd-cx-modal, .htmd-cx-toast { display: none !important; }
  .htmd-block { box-shadow: none; break-inside: avoid; }
}
`;

// HTML for the global compose-level export UI.
// When the page was rendered with `htmd compose --serve`, a
// <meta name="htmd-submit"> tag is present; the FAB becomes a two-stage
// dialog with a "Send to agent" primary button alongside the "Copy"
// fallback. Otherwise (v0.2 back-compat) only "Copy" is shown.
const COMPOSE_BRIDGE_UI = `
<button type="button" class="htmd-cx-fab" data-htmd-cx-export aria-label="Send all changes back to agent">
  <span aria-hidden="true">&#x21B5;</span>
  <span data-htmd-cx-fab-label>Copy all changes</span>
  <span class="htmd-cx-fab-badge" data-htmd-cx-count>0</span>
</button>
<div class="htmd-cx-modal" data-htmd-cx-modal hidden role="dialog" aria-modal="true" aria-labelledby="htmd-cx-title">
  <div class="htmd-cx-modal-backdrop" data-htmd-cx-close></div>
  <div class="htmd-cx-modal-panel">
    <header class="htmd-cx-modal-head">
      <h2 id="htmd-cx-title">Aggregated agent prompt</h2>
      <button type="button" class="htmd-cx-modal-x" data-htmd-cx-close aria-label="Close">&#x2715;</button>
    </header>
    <pre class="htmd-cx-modal-pre" data-htmd-cx-text></pre>
    <footer class="htmd-cx-modal-foot">
      <button type="button" class="htmd-cx-btn htmd-cx-btn-ghost" data-htmd-cx-close>Cancel</button>
      <button type="button" class="htmd-cx-btn htmd-cx-btn-ghost" data-htmd-cx-confirm>Copy</button>
      <button type="button" class="htmd-cx-btn htmd-cx-btn-primary" data-htmd-cx-send hidden>Send to agent</button>
    </footer>
  </div>
</div>
<div class="htmd-cx-toast" data-htmd-cx-toast hidden role="status" aria-live="polite"></div>
`;

// JS that wires up the compose-level "Copy all changes" action. Each
// interactive template's script.js may register an exporter into
// `window.__htmd.blocks` like:
//   window.__htmd.blocks.push({
//     template: 'feedback-corrector',
//     blockId: '...',
//     hasChanges: () => boolean,
//     getPrompt: () => string,
//   });
// Templates that already have their own per-block FAB still keep it; this is
// purely additive — a single button that aggregates ALL changes across blocks.
const COMPOSE_BRIDGE_JS = `
(function () {
  if (!window.__htmd) window.__htmd = { blocks: [] };
  const reg = window.__htmd;
  const fab = document.querySelector('[data-htmd-cx-export]');
  const countEl = document.querySelector('[data-htmd-cx-count]');
  const modal = document.querySelector('[data-htmd-cx-modal]');
  const modalText = document.querySelector('[data-htmd-cx-text]');
  const toast = document.querySelector('[data-htmd-cx-toast]');
  if (!fab) return;

  function changedBlocks() {
    return reg.blocks.filter((b) => {
      try { return typeof b.hasChanges === 'function' ? !!b.hasChanges() : true; }
      catch { return false; }
    });
  }

  function refresh() {
    const n = changedBlocks().length;
    if (countEl) countEl.textContent = n;
    fab.disabled = n === 0;
    fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false');
  }

  function buildAggregatePrompt() {
    const parts = [];
    parts.push('I reviewed your output in the browser and have the following changes/answers across multiple blocks. Please proceed accordingly.');
    parts.push('');
    let n = 0;
    for (const b of reg.blocks) {
      let changes = false;
      try { changes = typeof b.hasChanges === 'function' ? !!b.hasChanges() : true; } catch { changes = false; }
      if (!changes) continue;
      let promptText = '';
      try { promptText = b.getPrompt ? b.getPrompt() : ''; } catch (e) { promptText = '(error generating prompt: ' + e.message + ')'; }
      if (!promptText) continue;
      n++;
      parts.push('---');
      parts.push('Block ' + n + ' (' + (b.template || 'unknown') + (b.blockId ? ' #' + b.blockId : '') + '):');
      parts.push('');
      parts.push(promptText.trim());
      parts.push('');
    }
    if (n === 0) parts.push('(no changes recorded)');
    return parts.join('\\n');
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.removeAttribute('hidden');
    void toast.offsetWidth;
    toast.classList.add('htmd-cx-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('htmd-cx-toast-show');
      setTimeout(() => toast.setAttribute('hidden', ''), 220);
    }, 1800);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function open() {
    if (changedBlocks().length === 0) { showToast('No changes yet'); return; }
    if (!modal) return;
    if (modalText) modalText.textContent = buildAggregatePrompt();
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  // -------- Send-to-agent (Phase 1: only available when rendered with --serve) --------
  const submitMeta = document.querySelector('meta[name="htmd-submit"]');
  const submitUrl = submitMeta ? submitMeta.getAttribute('content') : '';
  const renderIdMeta = document.querySelector('meta[name="htmd-render-id"]');
  const renderId = renderIdMeta ? renderIdMeta.getAttribute('content') : '';
  const sendBtn = document.querySelector('[data-htmd-cx-send]');
  const fabLabel = document.querySelector('[data-htmd-cx-fab-label]');
  if (submitUrl && sendBtn) {
    sendBtn.removeAttribute('hidden');
    if (fabLabel) fabLabel.textContent = 'Send all changes';
  }

  // Telegram WebApp shim: no-op for now so this same JS will work later when
  // the page is opened inside a Telegram Mini App without code changes.
  if (!window.Telegram) window.Telegram = {};
  if (!window.Telegram.WebApp) {
    window.Telegram.WebApp = {
      ready: () => {},
      expand: () => {},
      close: () => {},
      sendData: (data) => { console.log('[Telegram.WebApp shim] sendData:', data); },
      onEvent: () => {},
      offEvent: () => {},
      MainButton: { show: () => {}, hide: () => {}, setText: () => {}, onClick: () => {} }
    };
  }
  try { window.Telegram.WebApp.ready(); } catch {}

  async function sendToAgent() {
    if (!submitUrl) return;
    const text = modalText ? modalText.textContent : buildAggregatePrompt();
    const payload = {
      prompt: text,
      contextId: renderId || '',
      blocks: reg.blocks.map((b) => {
        let promptText = '';
        try { promptText = b.getPrompt ? b.getPrompt() : ''; } catch (e) { promptText = ''; }
        return {
          template: b.template || 'unknown',
          blockId: b.blockId || '',
          hasChanges: (() => { try { return typeof b.hasChanges === 'function' ? !!b.hasChanges() : true; } catch { return false; } })(),
          prompt: promptText
        };
      })
    };
    sendBtn.disabled = true;
    const originalLabel = sendBtn.textContent;
    sendBtn.textContent = 'Sending…';
    try {
      const res = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        close();
        showToast('Sent to agent — check your chat');
      } else {
        const msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
        showToast('Send failed: ' + msg);
        console.error('[htmd send] failed', data);
      }
    } catch (e) {
      showToast('Send failed: ' + e.message);
      console.error('[htmd send]', e);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = originalLabel;
    }
  }

  fab.addEventListener('click', open);
  document.querySelectorAll('[data-htmd-cx-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = document.querySelector('[data-htmd-cx-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildAggregatePrompt();
    const ok = await copyText(text);
    if (ok) {
      // Keep modal open if "Send to agent" is also visible (user might still
      // want to send); close otherwise to match v0.2 behaviour.
      if (!submitUrl) close();
    }
    showToast(ok ? 'Copied to clipboard' : 'Copy failed — see console');
    if (!ok) console.log(text);
  });
  if (sendBtn) sendBtn.addEventListener('click', sendToAgent);

  // Poll for changes (cheap; covers the case where a block doesn't dispatch events).
  setInterval(refresh, 800);
  refresh();
})();
`;
