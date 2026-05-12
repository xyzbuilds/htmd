import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const questions = (data.questions || []).map((q, idx) => normalizeQuestion(q, idx));

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Questions',
    prompt_intro: data.prompt_intro || '',
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      kind: q.kind,
      answer: q.default_answer || (q.kind === 'multi' ? [] : ''),
      original_answer: q.default_answer || (q.kind === 'multi' ? [] : '')
    }))
  };

  return html`
    <main class="qa">
      <header class="qa-head">
        <h1 class="qa-title">${data.title || 'Clarifying questions'}</h1>
        ${data.subtitle ? html`<p class="qa-subtitle">${data.subtitle}</p>` : ''}
        <div class="qa-progress" data-qa-progress aria-live="polite">
          <span data-qa-answered>0</span> of <span>${questions.length}</span> answered
        </div>
      </header>

      <ol class="qa-list">
        ${questions.map((q) => questionCard(q))}
      </ol>

      <button type="button" class="qa-fab" data-qa-copy aria-label="Copy answers as prompt">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send answers back</span>
        <span class="qa-fab-badge" data-qa-count>0</span>
      </button>

      <div class="qa-modal" data-qa-modal hidden role="dialog" aria-modal="true">
        <div class="qa-backdrop" data-qa-close></div>
        <div class="qa-panel">
          <header><h2>Answer prompt</h2><button type="button" class="qa-x" data-qa-close aria-label="Close">&#x2715;</button></header>
          <pre class="qa-pre" data-qa-text></pre>
          <footer>
            <button type="button" class="qa-btn qa-btn-ghost" data-qa-close>Cancel</button>
            <button type="button" class="qa-btn qa-btn-primary" data-qa-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="qa-toast" data-qa-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-qa-state data-htmd-state="q-and-a">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function normalizeQuestion(q, idx) {
  const kind = q.kind || (Array.isArray(q.choices) ? (q.multi ? 'multi' : 'single') : 'free');
  return {
    id: q.id || `q${idx + 1}`,
    prompt: q.prompt || q.question || '',
    context: q.context || '',
    kind,
    choices: Array.isArray(q.choices) ? q.choices : [],
    default_answer: q.default_answer ?? null,
    placeholder: q.placeholder || ''
  };
}

function questionCard(q) {
  return html`
    <li class="qa-item" data-qa-item="${q.id}">
      <div class="qa-q">${q.prompt}</div>
      ${q.context ? html`<p class="qa-context">${q.context}</p>` : ''}
      ${renderInput(q)}
    </li>
  `;
}

function renderInput(q) {
  if (q.kind === 'single' || q.kind === 'multi') {
    const inputType = q.kind === 'multi' ? 'checkbox' : 'radio';
    return html`
      <div class="qa-choices">
        ${q.choices.map((c, i) => {
          const value = typeof c === 'string' ? c : (c.value || c.label || `c${i + 1}`);
          const label = typeof c === 'string' ? c : (c.label || c.value);
          return html`
            <label class="qa-choice">
              <input type="${inputType}" name="qa-${q.id}" value="${value}" data-qa-input="${q.id}" data-qa-kind="${q.kind}">
              <span class="qa-choice-text">${label}</span>
            </label>
          `;
        })}
        ${q.kind === 'single' ? '' : html`<small class="qa-hint">Choose all that apply</small>`}
      </div>
    `;
  }
  // Free text (default)
  return html`
    <textarea class="qa-text" rows="2" data-qa-input="${q.id}" data-qa-kind="free" placeholder="${q.placeholder || 'Your answer…'}"></textarea>
  `;
}

function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}
