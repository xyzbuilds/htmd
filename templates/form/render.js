import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const fields = (data.fields || []).map((f, i) => ({
    name: f.name || `field_${i + 1}`,
    label: f.label || f.name || `Field ${i + 1}`,
    type: f.type || 'text',
    required: !!f.required,
    help: f.help || '',
    placeholder: f.placeholder || '',
    default: f.default ?? '',
    options: Array.isArray(f.options) ? f.options.map(normalizeOption) : []
  }));

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Form',
    prompt_intro: data.prompt_intro || '',
    submit_label: data.submit_label || 'Submit',
    fields: fields.map((f) => ({ name: f.name, label: f.label, type: f.type, required: f.required }))
  };

  return html`
    <main class="fm">
      <header class="fm-head">
        <h1 class="fm-title">${data.title || 'Form'}</h1>
        ${data.subtitle ? html`<p class="fm-subtitle">${data.subtitle}</p>` : ''}
        ${data.intro ? html`<p class="fm-intro">${data.intro}</p>` : ''}
      </header>

      <form class="fm-form" data-fm-form novalidate>
        ${fields.map((f) => fieldRow(f))}
        <p class="fm-err" data-fm-err hidden></p>
      </form>

      <button type="button" class="fm-fab" data-fm-submit aria-label="Submit form">
        <span aria-hidden="true">&#x21B5;</span>
        <span>${data.submit_label || 'Submit'}</span>
      </button>

      <div class="fm-modal" data-fm-modal hidden role="dialog" aria-modal="true">
        <div class="fm-backdrop" data-fm-close></div>
        <div class="fm-panel">
          <header><h2>Submission</h2><button type="button" class="fm-x" data-fm-close aria-label="Close">&#x2715;</button></header>
          <pre class="fm-pre" data-fm-text></pre>
          <footer>
            <button type="button" class="fm-btn fm-btn-ghost" data-fm-close>Cancel</button>
            <button type="button" class="fm-btn fm-btn-primary" data-fm-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="fm-toast" data-fm-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-fm-state data-htmd-state="form">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function fieldRow(f) {
  const id = `fm-f-${f.name}`;
  const req = f.required ? html`<span class="fm-req" aria-label="required">*</span>` : '';
  return html`
    <div class="fm-field" data-fm-field="${f.name}">
      <label class="fm-label" for="${id}">${f.label} ${req}</label>
      ${renderControl(f, id)}
      ${f.help ? html`<p class="fm-help">${f.help}</p>` : ''}
    </div>
  `;
}

function renderControl(f, id) {
  switch (f.type) {
    case 'textarea':
      return html`<textarea class="fm-input fm-textarea" id="${id}" name="${f.name}" data-fm-name="${f.name}" rows="4" placeholder="${f.placeholder}" ${f.required ? 'required' : ''}>${f.default || ''}</textarea>`;
    case 'number':
      return html`<input class="fm-input" type="number" id="${id}" name="${f.name}" data-fm-name="${f.name}" data-fm-type="number" placeholder="${f.placeholder}" value="${f.default === '' ? '' : String(f.default)}" ${f.required ? 'required' : ''}>`;
    case 'select':
      return html`
        <select class="fm-input fm-select" id="${id}" name="${f.name}" data-fm-name="${f.name}" ${f.required ? 'required' : ''}>
          ${f.required ? '' : html`<option value="">— select —</option>`}
          ${f.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(f.default) ? 'selected' : ''}>${o.label}</option>`)}
        </select>
      `;
    case 'checkbox':
      if (f.options && f.options.length) {
        return html`
          <div class="fm-checks" data-fm-name="${f.name}" data-fm-type="checkbox-group" role="group" aria-labelledby="${id}-lbl">
            ${f.options.map((o, i) => html`
              <label class="fm-check">
                <input type="checkbox" name="${f.name}" value="${o.value}" data-fm-cb="${f.name}" ${Array.isArray(f.default) && f.default.includes(o.value) ? 'checked' : ''}>
                <span>${o.label}</span>
              </label>
            `)}
          </div>
        `;
      }
      return html`
        <label class="fm-check fm-check-solo">
          <input type="checkbox" id="${id}" name="${f.name}" data-fm-name="${f.name}" data-fm-type="checkbox" ${f.default === true ? 'checked' : ''}>
          <span class="fm-check-label">${f.help || 'Yes'}</span>
        </label>
      `;
    case 'radio':
      return html`
        <div class="fm-checks" data-fm-name="${f.name}" data-fm-type="radio-group" role="radiogroup">
          ${f.options.map((o) => html`
            <label class="fm-check">
              <input type="radio" name="${f.name}" value="${o.value}" data-fm-radio="${f.name}" ${String(o.value) === String(f.default) ? 'checked' : ''} ${f.required ? 'required' : ''}>
              <span>${o.label}</span>
            </label>
          `)}
        </div>
      `;
    case 'date':
      return html`<input class="fm-input" type="date" id="${id}" name="${f.name}" data-fm-name="${f.name}" value="${f.default || ''}" ${f.required ? 'required' : ''}>`;
    case 'email':
      return html`<input class="fm-input" type="email" id="${id}" name="${f.name}" data-fm-name="${f.name}" placeholder="${f.placeholder}" value="${f.default || ''}" ${f.required ? 'required' : ''}>`;
    case 'url':
      return html`<input class="fm-input" type="url" id="${id}" name="${f.name}" data-fm-name="${f.name}" placeholder="${f.placeholder}" value="${f.default || ''}" ${f.required ? 'required' : ''}>`;
    case 'text':
    default:
      return html`<input class="fm-input" type="text" id="${id}" name="${f.name}" data-fm-name="${f.name}" placeholder="${f.placeholder}" value="${f.default || ''}" ${f.required ? 'required' : ''}>`;
  }
}

function normalizeOption(o) {
  if (typeof o === 'string' || typeof o === 'number') return { value: o, label: String(o) };
  return { value: o.value, label: o.label || String(o.value) };
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
