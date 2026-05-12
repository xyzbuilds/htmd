import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const variables = (data.variables || []).map((v) => ({
    name: v.name,
    default: v.default ?? '',
    description: v.description || ''
  }));
  const samples = (data.samples || []).map((s, i) => ({
    sid: 's' + i,
    name: s.name || `Sample ${i + 1}`,
    vars: s.vars || {}
  }));
  const initial = {
    block_id: data.block_id || '',
    title: data.title || 'Prompt Tuner',
    prompt_intro: data.prompt_intro || '',
    original_template: data.prompt_template || '',
    variables,
    samples
  };

  return html`
    <main class="pt">
      <header class="pt-head">
        <h1 class="pt-title">${data.title || 'Prompt Tuner'}</h1>
        ${data.description ? html`<p class="pt-desc">${data.description}</p>` : ''}
        <ol class="pt-howto">
          <li><strong>Edit the template</strong> (left). Use <code>&#123;&#123;var_name&#125;&#125;</code> for placeholders.</li>
          <li><strong>Watch the samples</strong> below — each one renders the template with its own variable values.</li>
          <li>When happy, click <strong>Send tuned prompt back</strong> to copy the final template + your favorite sample back to the agent.</li>
        </ol>
      </header>

      <section class="pt-template">
        <header class="pt-section-head">
          <h2><span class="pt-step">1</span> Template</h2>
          <span class="pt-hint">Placeholders: ${variables.map((v) => html`<code>${v.name}</code>`)}</span>
        </header>
        <textarea class="pt-template-input" data-pt-template rows="8" spellcheck="false"></textarea>
      </section>

      <section class="pt-samples">
        <header class="pt-section-head">
          <h2><span class="pt-step">2</span> Samples — live preview</h2>
          <span class="pt-hint">Star ★ a sample to mark it as your preferred variant</span>
        </header>
        <div class="pt-samples-grid">
          ${samples.map((s) => sampleCard(s, variables, h))}
        </div>
      </section>

      <button type="button" class="pt-fab" data-pt-copy-all aria-label="Send the tuned template back to the agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send tuned prompt back</span>
        <span class="pt-fab-badge" data-pt-changed>0</span>
      </button>

      <div class="pt-modal" data-pt-modal hidden role="dialog" aria-modal="true">
        <div class="pt-backdrop" data-pt-close></div>
        <div class="pt-panel">
          <header><h2>Tuned prompt</h2><button type="button" class="pt-x" data-pt-close aria-label="Close">&#x2715;</button></header>
          <pre class="pt-pre" data-pt-text></pre>
          <footer>
            <button type="button" class="pt-btn pt-btn-ghost" data-pt-close>Cancel</button>
            <button type="button" class="pt-btn pt-btn-primary" data-pt-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="pt-toast" data-pt-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-pt-state data-htmd-state="prompt-tuner">${h.raw(safeJson(initial))}</script>
    </main>
  `;
}

function sampleCard(s, variables, h) {
  return html`
    <article class="pt-sample" data-pt-sample="${s.sid}">
      <header class="pt-sample-head">
        <button type="button" class="pt-star" data-pt-star="${s.sid}" aria-label="Mark preferred">★</button>
        <h3>${s.name}</h3>
        <button type="button" class="pt-copy" data-pt-copy="${s.sid}">Copy output</button>
      </header>
      <div class="pt-vars">
        ${variables.map((v) => html`
          <label class="pt-var">
            <span class="pt-var-name">${v.name}</span>
            <textarea data-pt-var="${s.sid}:${v.name}" rows="1" placeholder="${v.description || v.default || ''}"></textarea>
          </label>
        `)}
      </div>
      <div class="pt-output-wrap">
        <header class="pt-output-head">Output preview</header>
        <pre class="pt-output" data-pt-output="${s.sid}"></pre>
      </div>
    </article>
  `;
}

function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}
