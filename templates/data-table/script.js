(function () {
  const root = document.querySelector('main.dt');
  if (!root) return;
  const stateNode = root.querySelector('[data-dt-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const body = root.querySelector('[data-dt-body]');
  const search = root.querySelector('[data-dt-search]');
  const counter = root.querySelector('[data-dt-counter]');
  const empty = root.querySelector('[data-dt-empty]');
  const toast = root.querySelector('[data-dt-toast]');
  const heads = root.querySelectorAll('[data-dt-sort]');

  let filter = '';
  let sortKey = null;
  let sortDir = null;

  // -------- helpers --------
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function compare(a, b, type) {
    if (type === 'number' || type === 'currency' || type === 'percent') {
      const an = parseFloat(a); const bn = parseFloat(b);
      if (isNaN(an) && isNaN(bn)) return 0;
      if (isNaN(an)) return 1; if (isNaN(bn)) return -1;
      return an - bn;
    }
    if (type === 'date') {
      const ad = new Date(a).getTime(); const bd = new Date(b).getTime();
      return (isNaN(ad) ? 0 : ad) - (isNaN(bd) ? 0 : bd);
    }
    return String(a ?? '').localeCompare(String(b ?? ''));
  }
  function visibleRows() {
    let rows = state.rows.slice();
    if (filter) {
      const f = filter.toLowerCase();
      rows = rows.filter((r) => state.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(f)));
    }
    if (sortKey && sortDir) {
      const col = state.columns.find((c) => c.key === sortKey);
      const type = col ? col.type : 'text';
      rows.sort((a, b) => compare(a[sortKey], b[sortKey], type));
      if (sortDir === 'desc') rows.reverse();
    }
    return rows;
  }
  function fmtCell(val, col) {
    if (val == null || val === '') return '';
    switch (col.type) {
      case 'number': return typeof val === 'number' ? new Intl.NumberFormat('en-US').format(val) : String(val);
      case 'currency': return typeof val === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: col.currency || 'USD' }).format(val) : String(val);
      case 'percent': return typeof val === 'number' ? new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val) : String(val);
      case 'date': { try { const d = new Date(val); return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-US'); } catch { return String(val); } }
      default: return String(val);
    }
  }
  function originalById(id) { return state.original_rows.find((r) => r._id === id); }
  function rowLabel(r) { return r[state.row_key] ?? r._id; }

  // -------- editing diff --------
  function changes() {
    const out = [];
    state.rows.forEach((r) => {
      const orig = originalById(r._id) || {};
      state.columns.forEach((c) => {
        if (!c.editable) return;
        const a = orig[c.key]; const b = r[c.key];
        const changed = (a ?? '') !== (b ?? '');
        if (changed) out.push({ row: rowLabel(r), col: c.label, was: a, now: b });
      });
    });
    return out;
  }
  function refreshEditState() {
    const editsBtn = root.querySelector('[data-dt-copy-edits]');
    const badge = root.querySelector('[data-dt-edit-count]');
    const ch = changes();
    if (badge) badge.textContent = ch.length;
    if (editsBtn) {
      if (ch.length > 0) editsBtn.removeAttribute('hidden');
      else editsBtn.setAttribute('hidden', '');
    }
  }

  // -------- render --------
  function render() {
    const rows = visibleRows();
    body.innerHTML = rows.map((r) => `<tr data-dt-row="${escapeHtml(r._id)}">${rowHtml(r)}</tr>`).join('');
    if (empty) {
      if (rows.length === 0) empty.removeAttribute('hidden'); else empty.setAttribute('hidden', '');
    }
    if (counter) counter.textContent = `${rows.length} of ${state.rows.length} rows`;
    heads.forEach((th) => {
      const k = th.dataset.dtSort;
      if (k === sortKey && sortDir) th.dataset.dtDir = sortDir; else th.removeAttribute('data-dt-dir');
    });
    wireCellInputs();
  }
  function rowHtml(r) {
    return state.columns.map((c) => {
      let inner;
      if (c.editable) {
        const v = r[c.key];
        const inputType = (c.type === 'number' || c.type === 'currency' || c.type === 'percent') ? 'number' : 'text';
        inner = `<input type="${inputType}" class="dt-cell-input" data-dt-cell="${escapeHtml(r._id)}:${escapeHtml(c.key)}" value="${escapeHtml(v == null ? '' : v)}" step="any">`;
      } else {
        const text = fmtCell(r[c.key], c);
        let html = escapeHtml(text);
        if (c.type === 'badge' && text) html = `<span class="dt-badge">${escapeHtml(text)}</span>`;
        if (c.type === 'mono' && text) html = `<code>${escapeHtml(text)}</code>`;
        inner = html;
      }
      return `<td style="text-align:${c.align};">${inner}</td>`;
    }).join('');
  }
  function wireCellInputs() {
    body.querySelectorAll('[data-dt-cell]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const [rid, key] = inp.dataset.dtCell.split(':');
        const row = state.rows.find((r) => r._id === rid);
        const col = state.columns.find((c) => c.key === key);
        if (!row || !col) return;
        if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
          const v = inp.value === '' ? null : parseFloat(inp.value);
          row[key] = isFinite(v) ? v : null;
        } else {
          row[key] = inp.value;
        }
        refreshEditState();
      });
    });
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.removeAttribute('hidden'); void toast.offsetWidth;
    toast.classList.add('dt-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('dt-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  async function copyText(text) {
    if (navigator.clipboard) { try { await navigator.clipboard.writeText(text); return true; } catch {} }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta); return ok;
  }
  function buildMarkdown() {
    const rows = visibleRows();
    const cols = state.columns;
    const head = '| ' + cols.map((c) => c.label).join(' | ') + ' |';
    const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
    const lines = [head, sep];
    for (const r of rows) {
      lines.push('| ' + cols.map((c) => String(r[c.key] ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |');
    }
    return lines.join('\n');
  }
  function buildEditsPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Edits to "${state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    const ch = changes();
    if (ch.length === 0) lines.push('(no edits)');
    else {
      lines.push('Cell changes:');
      ch.forEach((c, i) => {
        lines.push(`${i + 1}. Row "${c.row}" / column "${c.col}": ${c.was ?? '(empty)'} → ${c.now ?? '(empty)'}`);
      });
    }
    lines.push(''); lines.push('Full table after edits:'); lines.push(''); lines.push(buildMarkdown());
    return lines.join('\n');
  }

  // -------- modal --------
  const modal = root.querySelector('[data-dt-modal]');
  const modalText = root.querySelector('[data-dt-text]');
  function openModal(text) {
    if (!modal) return;
    if (modalText) modalText.textContent = text;
    modal.removeAttribute('hidden');
  }
  function closeModal() { if (modal) modal.setAttribute('hidden', ''); }

  // -------- wire UI --------
  search?.addEventListener('input', () => { filter = search.value; render(); });
  heads.forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.dtSort;
    if (sortKey !== k) { sortKey = k; sortDir = 'asc'; }
    else if (sortDir === 'asc') sortDir = 'desc';
    else if (sortDir === 'desc') { sortKey = null; sortDir = null; }
    render();
  }));
  const copyBtn = root.querySelector('[data-dt-copy]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const text = buildMarkdown();
    const ok = await copyText(text);
    showToast(ok ? 'Copied as markdown' : 'Copy failed');
    if (!ok) console.log(text);
  });
  const editsBtn = root.querySelector('[data-dt-copy-edits]');
  if (editsBtn) editsBtn.addEventListener('click', () => openModal(buildEditsPrompt()));
  root.querySelectorAll('[data-dt-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) closeModal(); });
  const confirmBtn = root.querySelector('[data-dt-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildEditsPrompt();
    const ok = await copyText(text);
    closeModal(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'data-table',
    blockId: state.block_id || state.title,
    hasChanges: () => changes().length > 0 || filter !== '' || sortKey !== null,
    getPrompt: () => {
      if (changes().length > 0) return buildEditsPrompt();
      const lines = [`Filtered/sorted view of "${state.title}":`];
      if (filter) lines.push(`Filter: "${filter}"`);
      if (sortKey && sortDir) lines.push(`Sort: ${sortKey} ${sortDir}`);
      lines.push(''); lines.push(buildMarkdown());
      return lines.join('\n');
    }
  });

  render();
  refreshEditState();
})();
