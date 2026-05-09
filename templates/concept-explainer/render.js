import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const sections = data.sections || [];
  const glossary = data.glossary || [];
  const glossaryMap = {};
  glossary.forEach((g) => { glossaryMap[g.term] = g.definition; });

  return html`
    <main class="ce">
      <header class="ce-head">
        <h1 class="ce-title">${data.title}</h1>
        ${data.subtitle ? html`<p class="ce-subtitle">${data.subtitle}</p>` : ''}
      </header>
      ${data.intro_md ? html`<section class="ce-intro ce-prose">${h.md(data.intro_md)}</section>` : ''}

      <section class="ce-sections">
        ${sections.map((s, i) => sectionTpl(s, i, h))}
      </section>

      ${glossary.length ? html`
        <section class="ce-glossary">
          <h2>Glossary</h2>
          <dl>
            ${glossary.map((g) => html`
              <div class="ce-gl-item">
                <dt id="gl-${slug(g.term)}">${g.term}</dt>
                <dd>${g.definition}</dd>
              </div>
            `)}
          </dl>
        </section>
      ` : ''}
      <script type="application/json" data-ce-glossary>${JSON.stringify(glossaryMap)}</script>
    </main>
  `;
}

function sectionTpl(s, idx, h) {
  const codes = s.code_samples || [];
  return html`
    <details class="ce-section" ${idx === 0 ? html`open` : ''}>
      <summary>
        <span class="ce-section-num">${String(idx + 1).padStart(2, '0')}</span>
        <span>${s.title}</span>
      </summary>
      <div class="ce-section-body ce-prose">
        ${h.md(s.body_md || '')}
      </div>
      ${codes.length ? html`
        <div class="ce-tabs" data-ce-tabs>
          <div class="ce-tabs-bar" role="tablist">
            ${codes.map((c, i) => html`
              <button role="tab" data-ce-tab="${i}" ${i === 0 ? html`aria-selected="true"` : html`aria-selected="false"`}>${c.label || c.lang}</button>
            `)}
          </div>
          ${codes.map((c, i) => html`
            <pre class="ce-tab-panel" role="tabpanel" data-ce-panel="${i}" ${i === 0 ? '' : html`hidden`}><code>${c.code}</code></pre>
          `)}
        </div>
      ` : ''}
    </details>
  `;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
