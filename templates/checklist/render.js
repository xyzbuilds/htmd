import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const items = (data.items || []).map((it, idx) => ({
    id: it.id || `t${idx + 1}`,
    title: it.title || '',
    note: it.note || '',
    done: !!it.done,
    owner: it.owner || '',
    due: it.due || '',
    priority: it.priority || '',
    tags: Array.isArray(it.tags) ? it.tags : []
  }));

  const initialState = {
    items: items.map((it) => ({
      id: it.id,
      original_done: it.done,
      done: it.done,
      original_note: it.note,
      note: it.note,
      title: it.title
    })),
    title: data.title || 'Checklist',
    block_id: data.block_id || '',
    prompt_intro: data.prompt_intro || ''
  };

  return html`
    <main class="cl">
      <header class="cl-head">
        <h1 class="cl-title">${data.title || 'Checklist'}</h1>
        ${data.subtitle ? html`<p class="cl-subtitle">${data.subtitle}</p>` : ''}
        <div class="cl-progress" data-cl-progress aria-live="polite">
          <span data-cl-done>0</span> of <span>${items.length}</span> complete
        </div>
      </header>

      <ol class="cl-list">
        ${items.map((it) => itemRow(it))}
      </ol>

      <button type="button" class="cl-fab" data-cl-copy aria-label="Copy progress as prompt">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Copy progress as prompt</span>
        <span class="cl-fab-badge" data-cl-changed>0</span>
      </button>

      <div class="cl-modal" data-cl-modal hidden role="dialog" aria-modal="true">
        <div class="cl-modal-backdrop" data-cl-close></div>
        <div class="cl-modal-panel">
          <header><h2>Progress prompt</h2><button type="button" class="cl-x" data-cl-close aria-label="Close">&#x2715;</button></header>
          <pre class="cl-modal-pre" data-cl-text></pre>
          <footer>
            <button type="button" class="cl-btn cl-btn-ghost" data-cl-close>Cancel</button>
            <button type="button" class="cl-btn cl-btn-primary" data-cl-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="cl-toast" data-cl-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-cl-state data-htmd-state="checklist">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function itemRow(it) {
  return html`
    <li class="cl-item${it.done ? ' cl-done' : ''}" data-cl-item="${it.id}">
      <label class="cl-check">
        <input type="checkbox" data-cl-check="${it.id}" ${it.done ? 'checked' : ''}>
        <span class="cl-check-box" aria-hidden="true"></span>
      </label>
      <div class="cl-body">
        <div class="cl-title-row">
          <span class="cl-text">${it.title}</span>
          ${it.priority ? html`<span class="cl-pri cl-pri-${it.priority.toLowerCase()}">${it.priority}</span>` : ''}
        </div>
        <div class="cl-meta">
          ${it.owner ? html`<span class="cl-meta-pill">@${it.owner}</span>` : ''}
          ${it.due ? html`<span class="cl-meta-pill">due ${it.due}</span>` : ''}
          ${it.tags.map((t) => html`<span class="cl-meta-pill">#${t}</span>`)}
        </div>
        <textarea class="cl-note" rows="1" data-cl-note="${it.id}" placeholder="Add a note (optional)">${it.note}</textarea>
      </div>
    </li>
  `;
}

function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}
