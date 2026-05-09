import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const summary = data.summary || {};
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

      ${section('urgent', 'Urgent — needs you', data.urgent, h, true)}
      ${section('useful', 'Useful — read when you can', data.useful, h, false)}

      ${data.noise_summary ? html`
        <section class="ed-section ed-noise">
          <header class="ed-sec-head">
            <span class="ed-band ed-band-noise">Noise</span>
            <span class="ed-sec-count">filtered</span>
          </header>
          <p class="ed-noise-text">${data.noise_summary}</p>
        </section>
      ` : ''}
    </main>
  `;
}

function section(kind, label, items, h, withAction) {
  if (!items || items.length === 0) return '';
  return html`
    <section class="ed-section ed-${kind}">
      <header class="ed-sec-head">
        <span class="ed-band ed-band-${kind}">${label}</span>
        <span class="ed-sec-count">${items.length}</span>
      </header>
      <ul class="ed-list">
        ${items.map((it) => html`
          <li class="ed-item">
            <div class="ed-item-meta">
              <span class="ed-from">${it.from}</span>
              ${it.ts ? html`<time class="ed-ts">${it.ts}</time>` : ''}
            </div>
            <div class="ed-subject">${it.subject}</div>
            ${it.summary ? html`<p class="ed-snippet">${it.summary}</p>` : ''}
            ${withAction && it.action ? html`<div class="ed-action"><span class="ed-action-pill">${it.action}</span></div>` : ''}
          </li>
        `)}
      </ul>
    </section>
  `;
}
