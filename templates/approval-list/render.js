import { html } from '../../src/html-tag.js';

const DEFAULT_ACTIONS = [
  { value: 'approve', label: 'Approve', color: '#16a34a' },
  { value: 'reject',  label: 'Reject',  color: '#dc2626' },
  { value: 'hold',    label: 'Hold',    color: '#d97706' }
];

export default function render(data, h) {
  const actions = (Array.isArray(data.actions) && data.actions.length ? data.actions : DEFAULT_ACTIONS).map((a) => ({
    value: a.value,
    label: a.label || a.value,
    color: a.color || '#4f46e5'
  }));
  const items = (data.items || []).map((it, idx) => ({
    id: it.id || `a${idx + 1}`,
    title: it.title || '',
    subtitle: it.subtitle || '',
    body: it.body || '',
    metadata: it.metadata || {},
    suggested: it.suggested || ''
  }));

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Approvals',
    prompt_intro: data.prompt_intro || '',
    actions,
    items: items.map((it) => ({ id: it.id, title: it.title, decision: '', reason: '' }))
  };

  const colorStyles = actions
    .map((a) => `[data-al-color="${cssEscape(a.value)}"]{--al-color:${a.color};}`)
    .join('');

  return html`
    <main class="al">
      <header class="al-head">
        <h1 class="al-title">${data.title || 'Approvals'}</h1>
        ${data.subtitle ? html`<p class="al-subtitle">${data.subtitle}</p>` : ''}
        <div class="al-progress" data-al-progress aria-live="polite"><span data-al-decided>0</span> of <span>${items.length}</span> decided</div>
      </header>

      <style>${h.raw(colorStyles)}</style>

      <ol class="al-list">
        ${items.map((it) => itemCard(it, actions))}
      </ol>

      <button type="button" class="al-fab" data-al-copy aria-label="Send decisions back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send decisions back</span>
        <span class="al-fab-badge" data-al-count>0</span>
      </button>

      <div class="al-modal" data-al-modal hidden role="dialog" aria-modal="true">
        <div class="al-backdrop" data-al-close></div>
        <div class="al-panel">
          <header><h2>Decisions</h2><button type="button" class="al-x" data-al-close aria-label="Close">&#x2715;</button></header>
          <pre class="al-pre" data-al-text></pre>
          <footer>
            <button type="button" class="al-btn al-btn-ghost" data-al-close>Cancel</button>
            <button type="button" class="al-btn al-btn-primary" data-al-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="al-toast" data-al-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-al-state data-htmd-state="approval-list">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function itemCard(it, actions) {
  const meta = Object.entries(it.metadata || {});
  return html`
    <li class="al-item" data-al-item="${it.id}">
      <header class="al-item-head">
        <div class="al-item-meta">
          <div class="al-item-title">${it.title}</div>
          ${it.subtitle ? html`<div class="al-item-subtitle">${it.subtitle}</div>` : ''}
          ${meta.length ? html`
            <dl class="al-kv">
              ${meta.map(([k, v]) => html`<div class="al-kv-row"><dt>${k}</dt><dd>${typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>`)}
            </dl>
          ` : ''}
        </div>
        ${it.suggested ? html`<span class="al-mini">suggested: <strong>${it.suggested}</strong></span>` : ''}
      </header>
      ${it.body ? html`<p class="al-body">${it.body}</p>` : ''}
      <div class="al-actions" role="radiogroup" aria-label="Decision">
        ${actions.map((a) => html`
          <button type="button" class="al-btn-action" role="radio" aria-checked="false"
                  data-al-decision="${a.value}" data-al-decision-item="${it.id}" data-al-color="${a.value}">
            ${a.label}
          </button>
        `)}
      </div>
      <textarea class="al-reason" rows="1" data-al-reason="${it.id}" placeholder="Reason (optional)"></textarea>
    </li>
  `;
}

function cssEscape(v) { return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c); }
function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
