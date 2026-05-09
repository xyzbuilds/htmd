import { html, raw } from '../../src/html-tag.js';

export default function render(data, h) {
  const sections = data.sections || {};
  const metrics = data.metrics || [];
  const owner = data.owner ? html`<span class="sr-meta-owner">${data.owner}</span>` : '';
  return html`
    <main class="sr">
      <header class="sr-hero">
        <div class="sr-hero-top">
          <span class="sr-eyebrow">Status Report</span>
          ${data.period ? html`<span class="sr-period">${data.period}</span>` : ''}
        </div>
        <h1 class="sr-title">${data.title}</h1>
        <div class="sr-meta">
          ${owner}
        </div>
      </header>

      ${metrics.length ? html`
        <section class="sr-metrics" aria-label="Key metrics">
          ${metrics.map((m) => html`
            <div class="sr-metric">
              <div class="sr-metric-label">${m.label}</div>
              <div class="sr-metric-value">${m.value}</div>
              ${typeof m.delta === 'number' ? html`
                <div class="sr-metric-delta ${m.delta >= 0 ? 'up' : 'down'}">
                  ${m.delta >= 0 ? '▲' : '▼'} ${h.fmt.delta(Math.abs(m.delta))}
                </div>
              ` : ''}
            </div>
          `)}
        </section>
      ` : ''}

      <section class="sr-grid">
        ${section('shipped', 'Shipped', sections.shipped, h, { kind: 'success' })}
        ${section('in-progress', 'In progress', sections.in_progress, h, { kind: 'info', extra: 'eta' })}
        ${section('blocked', 'Blocked', sections.blocked, h, { kind: 'danger', extra: 'blocker' })}
        ${section('next-week', 'Next week', sections.next_week, h, { kind: 'muted' })}
      </section>
    </main>
  `;
}

function section(slug, title, items, h, opts) {
  const list = items || [];
  return html`
    <section class="sr-section sr-${slug}">
      <header class="sr-section-head">
        <span class="sr-pill sr-pill-${opts.kind}">${title}</span>
        <span class="sr-count">${list.length}</span>
      </header>
      ${list.length === 0 ? html`<div class="sr-empty">Nothing here</div>` : html`
        <ul class="sr-list">
          ${list.map((it) => html`
            <li class="sr-item">
              <div class="sr-item-title">
                ${it.link ? html`<a href="${it.link}">${it.title}</a>` : it.title}
              </div>
              <div class="sr-item-meta">
                ${opts.extra === 'eta' && it.eta ? html`<span class="sr-tag sr-tag-eta">ETA ${it.eta}</span>` : ''}
                ${opts.extra === 'blocker' && it.blocker ? html`<span class="sr-tag sr-tag-blocker">${it.blocker}</span>` : ''}
                ${it.owner ? html`<span class="sr-tag sr-tag-owner">${it.owner}</span>` : ''}
              </div>
            </li>
          `)}
        </ul>
      `}
    </section>
  `;
}
