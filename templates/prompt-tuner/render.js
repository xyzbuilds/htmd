import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const variables = data.variables || [];
  const samples = data.samples || [];
  // The state is stored in JSON form, embedded in a script tag for the runtime to pick up.
  const initial = {
    template: data.prompt_template || '',
    variables: variables.map((v) => ({ name: v.name, default: v.default ?? '' })),
    samples: samples.map((s) => ({ name: s.name, vars: s.vars || {} }))
  };
  return html`
    <main class="pt">
      <header class="pt-head">
        <h1 class="pt-title">${data.title || 'Prompt Tuner'}</h1>
        ${data.description ? html`<p class="pt-desc">${data.description}</p>` : ''}
      </header>
      <section class="pt-template">
        <header class="pt-section-head">
          <h2>Template</h2>
          <span class="pt-hint">use <code>{{var_name}}</code> for placeholders</span>
        </header>
        <textarea class="pt-template-input" data-pt-template spellcheck="false"></textarea>
      </section>
      <section class="pt-samples">
        ${samples.map((s, i) => html`
          <article class="pt-sample" data-pt-sample="${i}">
            <header class="pt-sample-head">
              <h3>${s.name}</h3>
              <button type="button" class="pt-copy" data-pt-copy="${i}">Copy</button>
            </header>
            <div class="pt-vars">
              ${variables.map((v) => html`
                <label class="pt-var">
                  <span class="pt-var-name">${v.name}</span>
                  <input type="text" data-pt-var="${i}:${v.name}" value="">
                </label>
              `)}
            </div>
            <div class="pt-output-wrap">
              <header class="pt-output-head">Output</header>
              <pre class="pt-output" data-pt-output="${i}"></pre>
            </div>
          </article>
        `)}
      </section>
      <script type="application/json" data-pt-state>${JSON.stringify(initial)}</script>
    </main>
  `;
}
