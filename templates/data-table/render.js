import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const tableEditable = !!data.editable;
  const columns = (data.columns || []).map((c) => ({
    key: c.key,
    label: c.label || c.key,
    type: c.type || 'text',
    align: c.align || (['number', 'currency', 'percent'].includes(c.type) ? 'right' : 'left'),
    width: c.width || '',
    editable: c.editable === false ? false : (c.editable === true ? true : tableEditable)
  }));
  const rows = (data.rows || []).map((r, i) => ({ ...r, _id: r._id || `r${i + 1}` }));
  const rowKey = data.row_key || (columns[0] && columns[0].key) || '_id';

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Data',
    prompt_intro: data.prompt_intro || '',
    editable: tableEditable,
    row_key: rowKey,
    columns,
    rows,
    original_rows: rows.map((r) => ({ ...r }))
  };

  const anyEditable = columns.some((c) => c.editable);

  return html`
    <main class="dt">
      <header class="dt-head">
        <h1 class="dt-title">${data.title || 'Data'}</h1>
        ${data.subtitle ? html`<p class="dt-subtitle">${data.subtitle}</p>` : ''}
        <div class="dt-controls">
          <input type="search" class="dt-search" data-dt-search placeholder="Filter rows…" aria-label="Filter rows">
          <span class="dt-counter" data-dt-counter></span>
          <button type="button" class="dt-export-btn" data-dt-copy aria-label="Copy filtered rows as markdown table">
            <span aria-hidden="true">&#x21B5;</span> Copy as markdown
          </button>
          ${anyEditable ? html`
            <button type="button" class="dt-export-btn dt-export-btn-edits" data-dt-copy-edits aria-label="Send my edits back to the agent" hidden>
              <span aria-hidden="true">&#x21B5;</span> Send edits back <span class="dt-edit-badge" data-dt-edit-count>0</span>
            </button>
          ` : ''}
        </div>
      </header>

      <div class="dt-wrap">
        <table class="dt-table">
          <thead>
            <tr>
              ${columns.map((c) => html`
                <th data-dt-sort="${c.key}" data-dt-type="${c.type}" style="${c.width ? 'width:' + c.width + ';' : ''}text-align:${c.align};">
                  <span>${c.label}</span><span class="dt-arrow" aria-hidden="true"></span>
                </th>
              `)}
            </tr>
          </thead>
          <tbody data-dt-body>
            ${rows.map((row) => renderRow(row, columns, h))}
          </tbody>
        </table>
        <div class="dt-empty" data-dt-empty hidden>No rows match.</div>
      </div>

      <div class="dt-modal" data-dt-modal hidden role="dialog" aria-modal="true">
        <div class="dt-backdrop" data-dt-close></div>
        <div class="dt-panel">
          <header><h2>Edits</h2><button type="button" class="dt-x" data-dt-close aria-label="Close">&#x2715;</button></header>
          <pre class="dt-pre" data-dt-text></pre>
          <footer>
            <button type="button" class="dt-btn dt-btn-ghost" data-dt-close>Cancel</button>
            <button type="button" class="dt-btn dt-btn-primary" data-dt-confirm>Copy</button>
          </footer>
        </div>
      </div>

      <div class="dt-toast" data-dt-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-dt-state data-htmd-state="data-table">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function renderRow(row, columns, h) {
  return html`
    <tr data-dt-row="${row._id}">
      ${columns.map((c) => html`<td style="text-align:${c.align};">${cellContent(row[c.key], row._id, c, h)}</td>`)}
    </tr>
  `;
}

function cellContent(val, rowId, col, h) {
  if (col.editable) {
    const display = formatRaw(val, col);
    return h.html`<input type="${col.type === 'number' || col.type === 'currency' || col.type === 'percent' ? 'number' : 'text'}"
      class="dt-cell-input"
      data-dt-cell="${rowId}:${col.key}"
      value="${display === null ? '' : display}"
      step="${col.type === 'percent' ? '0.001' : 'any'}">`;
  }
  if (val == null || val === '') return '';
  switch (col.type) {
    case 'number': return typeof val === 'number' ? new Intl.NumberFormat('en-US').format(val) : String(val);
    case 'currency': return typeof val === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: col.currency || 'USD' }).format(val) : String(val);
    case 'percent': return typeof val === 'number' ? new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val) : String(val);
    case 'date': {
      try { const d = new Date(val); return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-US'); } catch { return String(val); }
    }
    case 'badge': return h.html`<span class="dt-badge">${String(val)}</span>`;
    case 'mono':  return h.html`<code>${String(val)}</code>`;
    default: return String(val);
  }
}

function formatRaw(val, col) {
  // For editable inputs we keep the raw underlying value (numbers as numbers, dates ISO).
  if (val == null) return null;
  if (typeof val === 'number') return val;
  return String(val);
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
