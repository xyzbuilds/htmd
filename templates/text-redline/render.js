import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const segments = (data.segments || []).map((s, idx) => ({
    id: s.id || `s${idx + 1}`,
    text: s.text || '',
    note: s.note || '',
    locked: !!s.locked
  }));
  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Draft for review',
    prompt_intro: data.prompt_intro || '',
    segments: segments.map((s) => ({ id: s.id, original: s.text, edited: s.text, comment: '', accepted: !s.locked, locked: s.locked }))
  };

  return html`
    <main class="tr">
      <header class="tr-head">
        <h1 class="tr-title">${data.title || 'Draft for review'}</h1>
        ${data.subtitle ? html`<p class="tr-subtitle">${data.subtitle}</p>` : ''}
        <p class="tr-hint">Click any paragraph to edit. The "&times;" button rejects a paragraph; the &#x270E; reveals a comment field.</p>
      </header>

      <article class="tr-doc">
        ${segments.map((s) => segmentBlock(s))}
      </article>

      <button type="button" class="tr-fab" data-tr-copy aria-label="Send redlined draft back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send redlined draft</span>
        <span class="tr-fab-badge" data-tr-changed>0</span>
      </button>

      <div class="tr-modal" data-tr-modal hidden role="dialog" aria-modal="true">
        <div class="tr-backdrop" data-tr-close></div>
        <div class="tr-panel">
          <header><h2>Redlined draft</h2><button type="button" class="tr-x" data-tr-close aria-label="Close">&#x2715;</button></header>
          <pre class="tr-pre" data-tr-text></pre>
          <footer>
            <button type="button" class="tr-btn tr-btn-ghost" data-tr-close>Cancel</button>
            <button type="button" class="tr-btn tr-btn-primary" data-tr-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="tr-toast" data-tr-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-tr-state data-htmd-state="text-redline">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function segmentBlock(s) {
  return html`
    <div class="tr-seg" data-tr-seg="${s.id}">
      <div class="tr-seg-actions">
        <button type="button" class="tr-seg-btn" data-tr-comment="${s.id}" aria-label="Comment" title="Comment">&#x270E;</button>
        ${s.locked ? '' : html`<button type="button" class="tr-seg-btn tr-seg-btn-reject" data-tr-reject="${s.id}" aria-label="Reject paragraph" title="Reject">&times;</button>`}
      </div>
      <div class="tr-seg-text" contenteditable="${s.locked ? 'false' : 'true'}" data-tr-text="${s.id}" spellcheck="true">${s.text}</div>
      <textarea class="tr-seg-comment" rows="1" data-tr-comment-input="${s.id}" placeholder="Comment for the agent (optional)" hidden>${s.note}</textarea>
    </div>
  `;
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
