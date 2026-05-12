import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const items = (data.items || []).map((it, idx) => ({
    id: it.id || `r${idx + 1}`,
    title: it.title || '',
    subtitle: it.subtitle || '',
    body: it.body || ''
  }));
  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Rank',
    prompt_intro: data.prompt_intro || '',
    original_order: items.map((it) => it.id),
    items
  };

  return html`
    <main class="rk">
      <header class="rk-head">
        <h1 class="rk-title">${data.title || 'Rank these'}</h1>
        ${data.subtitle ? html`<p class="rk-subtitle">${data.subtitle}</p>` : ''}
        <p class="rk-hint">Drag to reorder &middot; or use the &uarr; / &darr; buttons</p>
      </header>

      <ol class="rk-list" data-rk-list>
        ${items.map((it, i) => itemCard(it, i + 1))}
      </ol>

      <button type="button" class="rk-fab" data-rk-copy aria-label="Send ranking back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send ranking back</span>
      </button>

      <div class="rk-modal" data-rk-modal hidden role="dialog" aria-modal="true">
        <div class="rk-backdrop" data-rk-close></div>
        <div class="rk-panel">
          <header><h2>Ranked order</h2><button type="button" class="rk-x" data-rk-close aria-label="Close">&#x2715;</button></header>
          <pre class="rk-pre" data-rk-text></pre>
          <footer>
            <button type="button" class="rk-btn rk-btn-ghost" data-rk-close>Cancel</button>
            <button type="button" class="rk-btn rk-btn-primary" data-rk-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="rk-toast" data-rk-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-rk-state data-htmd-state="rank-order">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function itemCard(it, n) {
  return html`
    <li class="rk-item" draggable="true" data-rk-item="${it.id}">
      <span class="rk-handle" aria-hidden="true">&#x2630;</span>
      <span class="rk-num" data-rk-num>${n}</span>
      <div class="rk-body">
        <div class="rk-title-text">${it.title}</div>
        ${it.subtitle ? html`<div class="rk-subtitle-text">${it.subtitle}</div>` : ''}
      </div>
      <div class="rk-arrows">
        <button type="button" class="rk-arrow" data-rk-up aria-label="Move up">&uarr;</button>
        <button type="button" class="rk-arrow" data-rk-down aria-label="Move down">&darr;</button>
      </div>
    </li>
  `;
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
