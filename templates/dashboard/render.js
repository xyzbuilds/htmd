import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const metrics = data.metrics || [];
  return html`
    <main class="db">
      <header class="db-head">
        <div>
          <h1 class="db-title">${data.title}</h1>
          ${data.subtitle ? html`<p class="db-subtitle">${data.subtitle}</p>` : ''}
        </div>
        ${data.updated_at ? html`<div class="db-updated">Updated ${h.fmt.date(data.updated_at)}</div>` : ''}
      </header>
      <section class="db-grid">
        ${metrics.map((m) => metricCard(m, h))}
      </section>
    </main>
  `;
}

function metricCard(m, h) {
  const formatted = formatValue(m.value, m.format);
  const target = m.target != null ? formatValue(m.target, m.format) : null;
  const trend = Array.isArray(m.trend) && m.trend.length > 1 ? h.chart.sparkline(m.trend, { width: 140, height: 36 }) : null;
  const deltaCls = typeof m.delta === 'number' ? (m.delta >= 0 ? 'up' : 'down') : '';
  return html`
    <article class="db-card">
      <header class="db-card-head">
        <span class="db-label">${m.label}</span>
        ${typeof m.delta === 'number' ? html`
          <span class="db-delta ${deltaCls}">
            ${m.delta >= 0 ? '▲' : '▼'} ${h.fmt.delta(Math.abs(m.delta))}
          </span>
        ` : ''}
      </header>
      <div class="db-value">${formatted}</div>
      ${target ? html`<div class="db-target">target ${target}</div>` : ''}
      ${trend ? html`<div class="db-spark">${trend}</div>` : ''}
    </article>
  `;
}

function formatValue(v, format) {
  if (v == null) return '';
  if (typeof v !== 'number') return String(v);
  if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  if (format === 'percent') return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(v);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);
}
