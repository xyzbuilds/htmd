import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const kind = data.kind || 'line';
  const w = data.width || 640;
  const ht = data.height || 240;

  let svg;
  if (kind === 'sparkline') {
    svg = h.chart.sparkline(data.values || [], { width: w, height: ht });
  } else if (kind === 'bar') {
    svg = h.chart.bar(data.items || [], { width: w, height: ht });
  } else if (kind === 'donut') {
    svg = h.chart.donut(data.slices || [], { size: Math.min(w, ht) });
  } else {
    // line
    const series = Array.isArray(data.series) ? data.series : [{ name: '', values: data.values || [] }];
    svg = h.chart.line(series, { width: w, height: ht });
  }

  return html`
    <main class="cb">
      <header class="cb-head">
        <h1 class="cb-title">${data.title || 'Chart'}</h1>
        ${data.subtitle ? html`<p class="cb-subtitle">${data.subtitle}</p>` : ''}
      </header>
      <figure class="cb-figure">
        ${svg}
        ${data.caption ? html`<figcaption class="cb-caption">${data.caption}</figcaption>` : ''}
      </figure>
      ${renderTable(data)}
    </main>
  `;
}

function renderTable(data) {
  if (!data.show_table) return '';
  const rows = collectRows(data);
  if (!rows.length) return '';
  return html`
    <details class="cb-data">
      <summary>Underlying data</summary>
      <table>
        <thead><tr><th>Label</th><th>Value</th></tr></thead>
        <tbody>
          ${rows.map((r) => html`<tr><td>${r.label}</td><td>${r.value}</td></tr>`)}
        </tbody>
      </table>
    </details>
  `;
}

function collectRows(data) {
  if (Array.isArray(data.items)) return data.items.map((it) => ({ label: it.label, value: it.value }));
  if (Array.isArray(data.slices)) return data.slices.map((s) => ({ label: s.label, value: s.value }));
  if (Array.isArray(data.values)) return data.values.map((v, i) => ({ label: i + 1, value: v }));
  if (Array.isArray(data.series)) {
    return data.series.flatMap((s) => (s.values || []).map((v, i) => ({ label: `${s.name || 'series'}[${i}]`, value: v })));
  }
  return [];
}
