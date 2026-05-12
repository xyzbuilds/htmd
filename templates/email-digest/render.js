import { html } from '../../src/html-tag.js';

const DEFAULT_ACTIONS = [
  { value: 'reply',   label: 'Reply',    color: '#0284c7' },
  { value: 'archive', label: 'Archive',  color: '#94a3b8' },
  { value: 'keep',    label: 'Keep',     color: '#16a34a' },
  { value: 'forward', label: 'Forward',  color: '#d97706' }
];

export default function render(data, h) {
  const actions = (Array.isArray(data.actions) && data.actions.length ? data.actions : DEFAULT_ACTIONS).map((a) => ({
    value: a.value, label: a.label || a.value, color: a.color || '#4f46e5'
  }));
  const summary = data.summary || {};
  const sections = [
    { kind: 'urgent', label: 'Urgent — needs you', items: data.urgent || [] },
    { kind: 'useful', label: 'Useful — read when you can', items: data.useful || [] }
  ];

  // Assign IDs and flatten for state
  let idCounter = 0;
  const flat = [];
  for (const s of sections) {
    s.items = s.items.map((it) => {
      idCounter++;
      const id = it.id || `e${idCounter}`;
      flat.push({
        id,
        section: s.kind,
        from: it.from,
        subject: it.subject,
        summary: it.summary || '',
        agent_action: it.action || ''
      });
      return { ...it, id };
    });
  }

  const initialState = {
    block_id: data.block_id || '',
    date: data.date || '',
    prompt_intro: data.prompt_intro || '',
    actions,
    items: flat.map((it) => ({ id: it.id, section: it.section, from: it.from, subject: it.subject, agent_action: it.agent_action, action: '', note: '' }))
  };

  const colorStyles = actions.map((a) => `[data-ed-action-color="${cssEscape(a.value)}"]{--ed-action-color:${a.color};}`).join('');

  return html`
    <main class="ed">
      <header class="ed-head">
        <span class="ed-eyebrow">Email Digest</span>
        <h1 class="ed-date">${h.fmt.date(data.date)}</h1>
        <div class="ed-summary">
          ${typeof summary.urgent === 'number' ? html`<span class="ed-chip ed-chip-urgent">${summary.urgent} urgent</span>` : ''}
          ${typeof summary.useful === 'number' ? html`<span class="ed-chip ed-chip-useful">${summary.useful} useful</span>` : ''}
          ${typeof summary.noise === 'number' ? html`<span class="ed-chip ed-chip-noise">${summary.noise} noise</span>` : ''}
        </div>
      </header>

      <style>${h.raw(colorStyles)}</style>

      ${section('urgent', 'Urgent — needs you', sections[0].items, actions, h)}
      ${section('useful', 'Useful — read when you can', sections[1].items, actions, h)}

      ${data.noise_summary ? html`
        <section class="ed-section ed-noise">
          <header class="ed-sec-head">
            <span class="ed-band ed-band-noise">Noise</span>
            <span class="ed-sec-count">filtered</span>
          </header>
          <p class="ed-noise-text">${data.noise_summary}</p>
        </section>
      ` : ''}

      <button type="button" class="ed-fab" data-ed-copy aria-label="Send actions back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send actions back</span>
        <span class="ed-fab-badge" data-ed-count>0</span>
      </button>

      <div class="ed-modal" data-ed-modal hidden role="dialog" aria-modal="true">
        <div class="ed-backdrop" data-ed-close></div>
        <div class="ed-panel">
          <header><h2>Inbox actions</h2><button type="button" class="ed-x" data-ed-close aria-label="Close">&#x2715;</button></header>
          <pre class="ed-pre" data-ed-text></pre>
          <footer>
            <button type="button" class="ed-btn ed-btn-ghost" data-ed-close>Cancel</button>
            <button type="button" class="ed-btn ed-btn-primary" data-ed-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="ed-toast" data-ed-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-ed-state data-htmd-state="email-digest">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function section(kind, label, items, actions, h) {
  if (!items || items.length === 0) return '';
  return html`
    <section class="ed-section ed-${kind}">
      <header class="ed-sec-head">
        <span class="ed-band ed-band-${kind}">${label}</span>
        <span class="ed-sec-count">${items.length}</span>
      </header>
      <ul class="ed-list">
        ${items.map((it) => html`
          <li class="ed-item" data-ed-item="${it.id}">
            <div class="ed-item-meta">
              <span class="ed-from">${it.from}</span>
              ${it.ts ? html`<time class="ed-ts">${it.ts}</time>` : ''}
            </div>
            <div class="ed-subject">${it.subject}</div>
            ${it.summary ? html`<p class="ed-snippet">${it.summary}</p>` : ''}
            ${it.action ? html`<div class="ed-suggested">Agent suggests: <strong>${it.action}</strong></div>` : ''}
            <div class="ed-actions" role="radiogroup" aria-label="What to do with this email">
              ${actions.map((a) => html`
                <button type="button" class="ed-action-btn" role="radio" aria-checked="false"
                        data-ed-action="${a.value}" data-ed-action-item="${it.id}" data-ed-action-color="${a.value}">
                  ${a.label}
                </button>
              `)}
            </div>
            <textarea class="ed-note" rows="1" data-ed-note="${it.id}" placeholder="Reply draft / note (optional)" hidden></textarea>
          </li>
        `)}
      </ul>
    </section>
  `;
}

function cssEscape(v) { return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c); }
function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
