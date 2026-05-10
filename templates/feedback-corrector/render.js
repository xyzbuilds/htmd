import { html } from '../../src/html-tag.js';

// Sensible default colors when label has no `color` set.
const DEFAULT_COLORS = {
  URGENT: '#dc2626',
  USEFUL: '#d97706',
  NOISE: '#94a3b8'
};

function pickColor(lbl) {
  if (lbl.color) return lbl.color;
  return DEFAULT_COLORS[lbl.value?.toUpperCase()] || '#4f46e5';
}

function labelMap(labels) {
  const out = {};
  for (const l of labels) {
    out[l.value] = {
      ...l,
      _color: pickColor(l)
    };
  }
  return out;
}

export default function render(data, h) {
  const labels = data.labels || [];
  const items = data.items || [];
  const lmap = labelMap(labels);

  const initialState = {
    items: items.map((it) => ({
      id: it.id,
      original_label: it.current_label,
      current_label: it.current_label,
      title: it.title || '',
      subtitle: it.subtitle || '',
      clarification: ''
    })),
    labels: labels.map((l) => ({ ...l, _color: pickColor(l) })),
    context_id: data.context_id || '',
    prompt_intro: data.prompt_intro || '',
    prompt_template: data.prompt_template || ''
  };

  // Build per-label CSS color variables for badges/pills.
  const colorStyles = labels
    .map((l) => `[data-fc-color="${cssEscape(l.value)}"]{--fc-label-color:${pickColor(l)};}`)
    .join('');

  return html`
    <main class="fc">
      <header class="fc-head">
        <h1 class="fc-title">${data.title || 'Feedback Corrector'}</h1>
        ${data.subtitle ? html`<p class="fc-subtitle">${data.subtitle}</p>` : ''}
      </header>

      <style>${h.raw(colorStyles)}</style>

      <ol class="fc-list">
        ${items.map((it, idx) => itemCard(it, idx, lmap, labels))}
      </ol>

      <div class="fc-bottom-spacer" aria-hidden="true"></div>

      <button type="button" class="fc-fab" data-fc-copy aria-label="Copy correction prompt">
        <span class="fc-fab-icon" aria-hidden="true">&#x270E;</span>
        <span class="fc-fab-label">Copy Correction Prompt</span>
        <span class="fc-fab-badge" data-fc-modified-count>0</span>
      </button>

      <div class="fc-modal" data-fc-modal hidden role="dialog" aria-modal="true" aria-labelledby="fc-modal-title">
        <div class="fc-modal-backdrop" data-fc-modal-close></div>
        <div class="fc-modal-panel">
          <header class="fc-modal-head">
            <h2 id="fc-modal-title">Correction prompt</h2>
            <button type="button" class="fc-modal-x" data-fc-modal-close aria-label="Close">&#x2715;</button>
          </header>
          <pre class="fc-modal-pre" data-fc-modal-text></pre>
          <footer class="fc-modal-foot">
            <button type="button" class="fc-btn fc-btn-ghost" data-fc-modal-close>Cancel</button>
            <button type="button" class="fc-btn fc-btn-primary" data-fc-confirm-copy>Copy</button>
          </footer>
        </div>
      </div>

      <div class="fc-toast" data-fc-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-fc-state>${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function itemCard(item, idx, lmap, labels) {
  const current = lmap[item.current_label];
  const meta = item.metadata || {};
  return html`
    <li class="fc-item" data-fc-item="${item.id}" data-fc-idx="${idx}">
      <header class="fc-item-head">
        <div class="fc-item-meta">
          ${item.title ? html`<div class="fc-item-title">${item.title}</div>` : ''}
          ${item.subtitle ? html`<div class="fc-item-subtitle">${item.subtitle}</div>` : ''}
          ${renderMeta(meta)}
        </div>
        <div class="fc-current-wrap">
          <span class="fc-mini-label">currently</span>
          ${badge(current, item.current_label)}
        </div>
      </header>

      ${item.body ? html`<p class="fc-item-body">${item.body}</p>` : ''}
      ${item.verdict_reason ? html`<p class="fc-verdict"><span class="fc-verdict-label">Reason:</span> ${item.verdict_reason}</p>` : ''}

      <div class="fc-pills" role="radiogroup" aria-label="Choose correct label">
        ${labels.map((l) => pill(l, item.current_label === l.value, item.id))}
      </div>

      <label class="fc-clar">
        <span class="fc-clar-label">Clarification (optional)</span>
        <textarea class="fc-clar-input" rows="2" data-fc-clar="${item.id}" placeholder="Why this label? Any nuance to share?"></textarea>
      </label>

      <div class="fc-modified-tag" data-fc-modified-tag hidden>Modified</div>
    </li>
  `;
}

function renderMeta(meta) {
  const entries = Object.entries(meta || {});
  if (!entries.length) return '';
  return html`
    <dl class="fc-kv">
      ${entries.map(([k, v]) => html`
        <div class="fc-kv-row">
          <dt>${k}</dt>
          <dd>${formatVal(v)}</dd>
        </div>
      `)}
    </dl>
  `;
}

function formatVal(v) {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function badge(lbl, fallbackValue) {
  if (!lbl) {
    return html`<span class="fc-badge" data-fc-color="unknown">${fallbackValue}</span>`;
  }
  return html`
    <span class="fc-badge" data-fc-color="${lbl.value}">
      ${lbl.emoji ? html`<span class="fc-badge-emoji" aria-hidden="true">${lbl.emoji}</span>` : ''}
      <span class="fc-badge-text">${lbl.label}</span>
    </span>
  `;
}

function pill(lbl, selected, itemId) {
  return html`
    <button
      type="button"
      class="fc-pill${selected ? ' fc-pill-selected' : ''}"
      role="radio"
      aria-checked="${selected ? 'true' : 'false'}"
      data-fc-pill="${lbl.value}"
      data-fc-pill-item="${itemId}"
      data-fc-color="${lbl.value}"
    >
      ${lbl.emoji ? html`<span class="fc-pill-emoji" aria-hidden="true">${lbl.emoji}</span>` : ''}
      <span class="fc-pill-text">${lbl.label}</span>
    </button>
  `;
}

// --- helpers ---

function cssEscape(v) {
  return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
}

// Make JSON safe for embedding inside <script type="application/json"> by
// breaking any literal `</script` sequence.
function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}
