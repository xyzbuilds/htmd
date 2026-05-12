import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const approaches = (data.approaches || []).map((a, idx) => ({
    aid: 'a' + idx,
    name: a.name,
    summary: a.summary || '',
    pros: a.pros || [],
    cons: a.cons || [],
    when_to_use: a.when_to_use || '',
    code: a.code || ''
  }));

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || '',
    prompt_intro: data.prompt_intro || '',
    suggested: data.suggested || '',
    approaches: approaches.map((a) => ({ aid: a.aid, name: a.name, note: '' })),
    chosen: '',
    rationale: ''
  };

  return html`
    <main class="cmp">
      <header class="cmp-head">
        <h1 class="cmp-title">${data.title}</h1>
        ${data.subtitle ? html`<p class="cmp-subtitle">${data.subtitle}</p>` : ''}
        ${data.suggested ? html`<p class="cmp-suggested">Agent suggests: <strong>${data.suggested}</strong></p>` : ''}
      </header>
      <div class="cmp-grid" data-cols="${approaches.length}">
        ${approaches.map((a, i) => column(a, i, h))}
      </div>
      ${data.verdict ? html`
        <aside class="cmp-verdict">
          <span class="cmp-verdict-pill">Agent's verdict</span>
          <p>${h.md(data.verdict)}</p>
        </aside>
      ` : ''}

      <section class="cmp-decision">
        <header>Your decision</header>
        <div class="cmp-pick" role="radiogroup" aria-label="Pick the option you'd choose">
          ${approaches.map((a) => html`
            <label class="cmp-pick-opt">
              <input type="radio" name="cmp-pick" value="${a.aid}" data-cmp-pick>
              <span class="cmp-pick-text">${a.name}</span>
            </label>
          `)}
          <label class="cmp-pick-opt">
            <input type="radio" name="cmp-pick" value="__none__" data-cmp-pick>
            <span class="cmp-pick-text">None / something else</span>
          </label>
        </div>
        <label class="cmp-rat-label" for="cmp-rationale">Rationale (optional)</label>
        <textarea id="cmp-rationale" class="cmp-rationale" data-cmp-rationale rows="2" placeholder="Why this option (or why none of them)?"></textarea>
      </section>

      <button type="button" class="cmp-fab" data-cmp-copy aria-label="Send decision back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send decision back</span>
      </button>

      <div class="cmp-modal" data-cmp-modal hidden role="dialog" aria-modal="true">
        <div class="cmp-backdrop" data-cmp-close></div>
        <div class="cmp-panel">
          <header><h2>Decision</h2><button type="button" class="cmp-x" data-cmp-close aria-label="Close">&#x2715;</button></header>
          <pre class="cmp-pre" data-cmp-text></pre>
          <footer>
            <button type="button" class="cmp-btn cmp-btn-ghost" data-cmp-close>Cancel</button>
            <button type="button" class="cmp-btn cmp-btn-primary" data-cmp-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="cmp-toast" data-cmp-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-cmp-state data-htmd-state="comparison-3-up">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function column(a, idx, h) {
  return html`
    <article class="cmp-col" data-cmp-col="${a.aid}" data-idx="${idx}">
      <header class="cmp-col-head">
        <span class="cmp-col-num">${String(idx + 1).padStart(2, '0')}</span>
        <h2 class="cmp-col-name">${a.name}</h2>
        ${a.summary ? html`<p class="cmp-summary">${a.summary}</p>` : ''}
      </header>
      <section class="cmp-block cmp-pros">
        <h3>Pros</h3>
        <ul>${a.pros.map((p) => html`<li>${p}</li>`)}</ul>
      </section>
      <section class="cmp-block cmp-cons">
        <h3>Cons</h3>
        <ul>${a.cons.map((c) => html`<li>${c}</li>`)}</ul>
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
      <textarea class="cmp-note" data-cmp-note="${a.aid}" rows="1" placeholder="Note on ${a.name}…"></textarea>
    </article>
  `;
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
