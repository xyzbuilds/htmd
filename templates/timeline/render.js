import { html } from '../../src/html-tag.js';

const KINDS = new Set(['info', 'success', 'warning', 'error', 'neutral']);

export default function render(data, h) {
  const events = (data.events || []).map((e) => ({
    timestamp: e.timestamp || '',
    title: e.title || '',
    body: e.body || '',
    kind: KINDS.has(e.kind) ? e.kind : 'info',
    actor: e.actor || ''
  }));

  return html`
    <main class="tl">
      <header class="tl-head">
        <h1 class="tl-title">${data.title || 'Timeline'}</h1>
        ${data.subtitle ? html`<p class="tl-subtitle">${data.subtitle}</p>` : ''}
      </header>

      <ol class="tl-list">
        ${events.map((e) => eventItem(e, h))}
      </ol>
    </main>
  `;
}

function eventItem(e, h) {
  const display = formatTimestamp(e.timestamp, h);
  return html`
    <li class="tl-item tl-${e.kind}">
      <div class="tl-marker" aria-hidden="true"></div>
      <div class="tl-body">
        <div class="tl-meta">
          ${e.timestamp ? html`<time class="tl-ts" datetime="${e.timestamp}">${display}</time>` : ''}
          ${e.actor ? html`<span class="tl-actor">${e.actor}</span>` : ''}
          <span class="tl-pill tl-pill-${e.kind}">${e.kind}</span>
        </div>
        <div class="tl-evt-title">${e.title}</div>
        ${e.body ? html`<p class="tl-evt-body">${e.body}</p>` : ''}
      </div>
    </li>
  `;
}

function formatTimestamp(v, h) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const datePart = h.fmt.date(v);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const looksDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (looksDateOnly) return datePart;
  return `${datePart} ${hh}:${mm} UTC`;
}
