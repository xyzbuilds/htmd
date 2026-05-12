import { html, raw } from '../../src/html-tag.js';

export default function render(data, h) {
  const slides = (data.slides || []).map(normalizeSlide);
  return html`
    <main class="sd" data-theme="${data.theme || 'indigo'}">
      <header class="sd-toolbar" aria-hidden="true">
        <span class="sd-title">${data.title || 'Slides'}</span>
        <span class="sd-counter"><span data-sd-current>1</span> / <span data-sd-total>${slides.length}</span></span>
        <span class="sd-help">
          <kbd>←</kbd> <kbd>→</kbd> nav · <kbd>o</kbd> overview · <kbd>n</kbd> notes · <kbd>?</kbd> help
        </span>
      </header>
      <div class="sd-stage" tabindex="0">
        ${slides.map((s, i) => slide(s, i, slides.length, data, h))}
      </div>
      <div class="sd-overview" hidden>
        ${slides.map((s, i) => html`
          <button class="sd-thumb sd-thumb-${s.layout}" data-sd-jump="${i}" data-sd-accent="${s.accent || data.theme || 'indigo'}">
            <span class="sd-thumb-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="sd-thumb-title">${s.title || s.section || `Slide ${i + 1}`}</span>
            <span class="sd-thumb-layout">${s.layout}</span>
          </button>
        `)}
      </div>
      <aside class="sd-notes-panel" data-sd-notes-panel hidden>
        <header><strong>Speaker notes</strong><button data-sd-close-notes aria-label="Hide notes">×</button></header>
        <div data-sd-notes-body>No notes for this slide.</div>
      </aside>
      <dialog class="sd-dialog" data-sd-help-dialog>
        <h2>Keyboard shortcuts</h2>
        <ul>
          <li><kbd>←</kbd> / <kbd>→</kbd> previous / next slide</li>
          <li><kbd>Home</kbd> / <kbd>End</kbd> jump to first / last</li>
          <li><kbd>o</kbd> toggle overview</li>
          <li><kbd>n</kbd> toggle speaker notes panel</li>
          <li><kbd>?</kbd> this help</li>
          <li><kbd>Esc</kbd> exit overview / close help</li>
          <li><kbd>p</kbd> print (one slide per page)</li>
        </ul>
        <button data-sd-close-help>Close</button>
      </dialog>
    </main>
  `;
}

function normalizeSlide(s) {
  return {
    layout: s.layout || (s.code ? 'code' : s.kpis ? 'kpis' : s.quote ? 'quote' : s.section ? 'section' : s.chart ? 'chart' : (s.left_md || s.right_md ? 'two-col' : 'bullets')),
    accent: s.accent,
    title: s.title || '',
    subtitle: s.subtitle || '',
    eyebrow: s.eyebrow || '',
    section: s.section || '',
    footer: s.footer || '',
    body_md: s.body_md || '',
    left_md: s.left_md || '',
    right_md: s.right_md || '',
    kpis: s.kpis || [],
    quote: s.quote || '',
    attribution: s.attribution || '',
    image: s.image || '',
    image_caption: s.image_caption || '',
    code: s.code || '',
    code_language: s.code_language || '',
    chart: s.chart || null,
    notes: s.notes || ''
  };
}

function slide(s, idx, total, deck, h) {
  const accent = s.accent || deck.theme || 'indigo';
  return html`
    <section class="sd-slide sd-slide-${s.layout}" data-sd-slide="${idx}" data-sd-accent="${accent}" ${idx === 0 ? raw('data-active') : ''}>
      <div class="sd-slide-inner">
        ${slideContent(s, idx, total, deck, h)}
      </div>
      <footer class="sd-slide-foot" aria-hidden="true">
        <span class="sd-slide-num">${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
        <span class="sd-slide-deck">${deck.title || ''}</span>
        ${s.footer ? html`<span class="sd-slide-footnote">${s.footer}</span>` : ''}
      </footer>
      ${s.notes ? html`<aside class="sd-notes" hidden>${s.notes}</aside>` : ''}
    </section>
  `;
}

function slideContent(s, idx, total, deck, h) {
  switch (s.layout) {
    case 'title':       return titleSlide(s, deck, h);
    case 'section':     return sectionSlide(s, idx, h);
    case 'two-col':     return twoColSlide(s, h);
    case 'kpis':        return kpiSlide(s, h);
    case 'quote':       return quoteSlide(s, h);
    case 'image':       return imageSlide(s, h);
    case 'code':        return codeSlide(s, h);
    case 'chart':       return chartSlide(s, h);
    case 'bullets':
    default:            return bulletsSlide(s, h);
  }
}

function titleSlide(s, deck, h) {
  return html`
    ${s.eyebrow ? html`<span class="sd-eyebrow">${s.eyebrow}</span>` : ''}
    <h1 class="sd-title-main">${s.title}</h1>
    ${s.subtitle ? html`<p class="sd-subtitle">${s.subtitle}</p>` : ''}
    ${s.body_md ? html`<div class="sd-title-body">${h.md(s.body_md)}</div>` : ''}
  `;
}

function sectionSlide(s, idx, h) {
  return html`
    <span class="sd-section-num">Part ${String(idx + 1).padStart(2, '0')}</span>
    <h2 class="sd-section-title">${s.section || s.title}</h2>
    ${s.subtitle ? html`<p class="sd-subtitle">${s.subtitle}</p>` : ''}
  `;
}

function bulletsSlide(s, h) {
  return html`
    ${s.eyebrow ? html`<span class="sd-eyebrow">${s.eyebrow}</span>` : ''}
    ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
    ${s.subtitle ? html`<p class="sd-slide-subtitle">${s.subtitle}</p>` : ''}
    ${s.body_md ? html`<div class="sd-slide-body">${h.md(s.body_md)}</div>` : ''}
  `;
}

function twoColSlide(s, h) {
  return html`
    ${s.eyebrow ? html`<span class="sd-eyebrow">${s.eyebrow}</span>` : ''}
    ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
    <div class="sd-two-col">
      <div class="sd-col">${s.left_md ? h.md(s.left_md) : ''}</div>
      <div class="sd-col">${s.right_md ? h.md(s.right_md) : ''}</div>
    </div>
  `;
}

function kpiSlide(s, h) {
  return html`
    ${s.eyebrow ? html`<span class="sd-eyebrow">${s.eyebrow}</span>` : ''}
    ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
    ${s.subtitle ? html`<p class="sd-slide-subtitle">${s.subtitle}</p>` : ''}
    <div class="sd-kpis" data-count="${s.kpis.length}">
      ${s.kpis.map((k) => kpiCard(k, h))}
    </div>
    ${s.body_md ? html`<div class="sd-slide-body sd-slide-body-small">${h.md(s.body_md)}</div>` : ''}
  `;
}

function kpiCard(k, h) {
  const deltaCls = typeof k.delta === 'number' ? (k.delta > 0 ? 'pos' : k.delta < 0 ? 'neg' : 'flat') : '';
  return html`
    <div class="sd-kpi">
      <div class="sd-kpi-label">${k.label}</div>
      <div class="sd-kpi-value">${typeof k.value === 'number' ? h.fmt.number(k.value) : k.value}</div>
      ${typeof k.delta === 'number' ? html`<div class="sd-kpi-delta sd-kpi-delta-${deltaCls}">${k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '–'} ${Math.abs(k.delta).toFixed(1)}%</div>` : ''}
      ${k.trend ? h.chart.sparkline(k.trend, { width: 140, height: 28 }) : ''}
    </div>
  `;
}

function quoteSlide(s, h) {
  return html`
    <blockquote class="sd-quote">
      <p>${s.quote}</p>
      ${s.attribution ? html`<footer>— ${s.attribution}</footer>` : ''}
    </blockquote>
  `;
}

function imageSlide(s, h) {
  return html`
    ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
    ${s.image ? html`<img class="sd-slide-image" src="${s.image}" alt="${s.image_caption || ''}">` : ''}
    ${s.image_caption ? html`<p class="sd-image-caption">${s.image_caption}</p>` : ''}
    ${s.body_md ? html`<div class="sd-slide-body sd-slide-body-small">${h.md(s.body_md)}</div>` : ''}
  `;
}

function codeSlide(s, h) {
  return html`
    ${s.eyebrow ? html`<span class="sd-eyebrow">${s.eyebrow}</span>` : ''}
    ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
    ${s.code_language ? html`<span class="sd-code-lang">${s.code_language}</span>` : ''}
    <pre class="sd-slide-code"><code>${s.code}</code></pre>
    ${s.body_md ? html`<div class="sd-slide-body sd-slide-body-small">${h.md(s.body_md)}</div>` : ''}
  `;
}

function chartSlide(s, h) {
  const c = s.chart || {};
  let svg;
  const w = 720, ht = 320;
  if (c.kind === 'bar') svg = h.chart.bar(c.items || [], { width: w, height: ht });
  else if (c.kind === 'donut') svg = h.chart.donut(c.slices || [], { size: 300 });
  else if (c.kind === 'sparkline') svg = h.chart.sparkline(c.values || [], { width: w, height: ht });
  else {
    const series = Array.isArray(c.series) ? c.series : [{ name: '', values: c.values || [] }];
    svg = h.chart.line(series, { width: w, height: ht });
  }
  return html`
    ${s.eyebrow ? html`<span class="sd-eyebrow">${s.eyebrow}</span>` : ''}
    ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
    <figure class="sd-chart">${svg}${c.caption ? html`<figcaption>${c.caption}</figcaption>` : ''}</figure>
    ${s.body_md ? html`<div class="sd-slide-body sd-slide-body-small">${h.md(s.body_md)}</div>` : ''}
  `;
}
