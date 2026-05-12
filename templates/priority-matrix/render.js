import { html } from '../../src/html-tag.js';

const DEFAULT_QUADRANTS = [
  { id: 'do',       label: 'Do now',     hint: 'Urgent + Important' },
  { id: 'plan',     label: 'Plan',       hint: 'Important, not urgent' },
  { id: 'delegate', label: 'Delegate',   hint: 'Urgent, not important' },
  { id: 'drop',     label: 'Drop',       hint: 'Neither' }
];

export default function render(data, h) {
  const quadrants = (data.quadrants && data.quadrants.length === 4 ? data.quadrants : DEFAULT_QUADRANTS).map((q) => ({
    id: q.id,
    label: q.label || q.id,
    hint: q.hint || ''
  }));
  const items = (data.items || []).map((it, idx) => ({
    id: it.id || `p${idx + 1}`,
    title: it.title || '',
    quadrant: it.quadrant || ''
  }));
  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Priority matrix',
    prompt_intro: data.prompt_intro || '',
    quadrants,
    items: items.map((it) => ({ ...it, original_quadrant: it.quadrant }))
  };

  return html`
    <main class="pm">
      <header class="pm-head">
        <h1 class="pm-title">${data.title || 'Priority matrix'}</h1>
        ${data.subtitle ? html`<p class="pm-subtitle">${data.subtitle}</p>` : ''}
        <p class="pm-hint">Drag items between quadrants. Items at the bottom haven't been placed yet.</p>
      </header>

      <div class="pm-grid">
        ${quadrants.map((q) => quadrantBox(q, items.filter((it) => it.quadrant === q.id)))}
      </div>

      <section class="pm-pool" data-pm-pool="">
        <header class="pm-pool-head">Unplaced</header>
        <ul class="pm-list" data-pm-list="">
          ${items.filter((it) => !it.quadrant).map((it) => itemChip(it))}
        </ul>
      </section>

      <button type="button" class="pm-fab" data-pm-copy aria-label="Send placement back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send placements back</span>
        <span class="pm-fab-badge" data-pm-changed>0</span>
      </button>

      <div class="pm-modal" data-pm-modal hidden role="dialog" aria-modal="true">
        <div class="pm-backdrop" data-pm-close></div>
        <div class="pm-panel">
          <header><h2>Placements</h2><button type="button" class="pm-x" data-pm-close aria-label="Close">&#x2715;</button></header>
          <pre class="pm-pre" data-pm-text></pre>
          <footer>
            <button type="button" class="pm-btn pm-btn-ghost" data-pm-close>Cancel</button>
            <button type="button" class="pm-btn pm-btn-primary" data-pm-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="pm-toast" data-pm-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-pm-state data-htmd-state="priority-matrix">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function quadrantBox(q, items) {
  return html`
    <section class="pm-quad" data-pm-quad="${q.id}">
      <header class="pm-quad-head">
        <strong>${q.label}</strong>
        ${q.hint ? html`<span class="pm-quad-hint">${q.hint}</span>` : ''}
      </header>
      <ul class="pm-list" data-pm-list="${q.id}">
        ${items.map((it) => itemChip(it))}
      </ul>
    </section>
  `;
}

function itemChip(it) {
  return html`
    <li class="pm-chip" draggable="true" data-pm-item="${it.id}">${it.title}</li>
  `;
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
