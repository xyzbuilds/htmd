import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const approaches = data.approaches || [];
  return html`
    <main class="cmp">
      <header class="cmp-head">
        <h1 class="cmp-title">${data.title}</h1>
        ${data.subtitle ? html`<p class="cmp-subtitle">${data.subtitle}</p>` : ''}
      </header>
      <div class="cmp-grid" data-cols="${approaches.length}">
        ${approaches.map((a, i) => column(a, i, h))}
      </div>
      ${data.verdict ? html`
        <aside class="cmp-verdict">
          <span class="cmp-verdict-pill">Verdict</span>
          <p>${h.md(data.verdict)}</p>
        </aside>
      ` : ''}
    </main>
  `;
}

function column(a, idx, h) {
  return html`
    <article class="cmp-col" data-idx="${idx}">
      <header class="cmp-col-head">
        <span class="cmp-col-num">${String(idx + 1).padStart(2, '0')}</span>
        <h2 class="cmp-col-name">${a.name}</h2>
        ${a.summary ? html`<p class="cmp-summary">${a.summary}</p>` : ''}
      </header>
      <section class="cmp-block cmp-pros">
        <h3>Pros</h3>
        <ul>${(a.pros || []).map((p) => html`<li>${p}</li>`)}</ul>
      </section>
      <section class="cmp-block cmp-cons">
        <h3>Cons</h3>
        <ul>${(a.cons || []).map((c) => html`<li>${c}</li>`)}</ul>
      </section>
      ${a.when_to_use ? html`
        <section class="cmp-block cmp-when">
          <h3>When to use</h3>
          <p>${a.when_to_use}</p>
        </section>
      ` : ''}
      ${a.code ? html`
        <section class="cmp-block cmp-code">
          <h3>Code</h3>
          <pre><code>${a.code}</code></pre>
        </section>
      ` : ''}
    </article>
  `;
}
