(function () {
  const root = document.querySelector('main.dm');
  if (!root) return;
  const stateNode = root.querySelector('[data-dm-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const fab = root.querySelector('[data-dm-copy]');
  const changedEl = root.querySelector('[data-dm-changed]');
  const modal = root.querySelector('[data-dm-modal]');
  const modalText = root.querySelector('[data-dm-text]');
  const toast = root.querySelector('[data-dm-toast]');
  const recName = root.querySelector('[data-dm-rec-name]');
  const recScore = root.querySelector('[data-dm-rec-score]');
  const rationale = root.querySelector('[data-dm-rationale]');

  const critByCid = new Map();
  const critByName = new Map();
  state.criteria.forEach((c) => { critByCid.set(c.cid, c); critByName.set(c.name, c); });
  const optByOid = new Map();
  state.options.forEach((o) => optByOid.set(o.oid, o));

  function computeTotals() {
    return state.options.map((opt) => {
      let total = 0; let wSum = 0;
      for (const c of state.criteria) {
        const raw = opt.scores[c.name];
        if (typeof raw !== 'number' || !isFinite(raw)) continue;
        const all = state.options.map((o) => o.scores[c.name]).filter((x) => typeof x === 'number' && isFinite(x));
        if (!all.length) continue;
        const max = Math.max(...all, 1);
        const min = Math.min(...all, 0);
        const range = max - min || 1;
        const norm = c.direction === 'lower_better' ? 1 - (raw - min) / range : (raw - min) / range;
        total += norm * (c.weight || 1);
        wSum += c.weight || 1;
      }
      return wSum > 0 ? total / wSum : 0;
    });
  }
  function heatFor(rawVal, criterionName) {
    const c = critByName.get(criterionName); if (!c) return null;
    const all = state.options.map((o) => o.scores[criterionName]).filter((x) => typeof x === 'number' && isFinite(x));
    if (!all.length || typeof rawVal !== 'number') return null;
    const max = Math.max(...all, 1); const min = Math.min(...all, 0); const range = max - min || 1;
    const norm = c.direction === 'lower_better' ? 1 - (rawVal - min) / range : (rawVal - min) / range;
    return Math.max(0, Math.min(1, norm));
  }
  function toneFor(heat) {
    if (heat == null) return 'empty';
    if (heat >= 0.66) return 'good';
    if (heat >= 0.33) return 'mid';
    return 'low';
  }

  function changes() {
    const c = [];
    state.criteria.forEach((cr) => {
      if (cr.weight !== cr.original_weight) c.push({ kind: 'weight', criterion: cr.name, was: cr.original_weight, now: cr.weight });
    });
    state.options.forEach((o) => {
      Object.keys({ ...o.scores, ...o.original_scores }).forEach((k) => {
        const a = o.original_scores[k]; const b = o.scores[k];
        if ((typeof a !== 'number' && typeof b !== 'number')) return;
        if (a !== b) c.push({ kind: 'score', option: o.name, criterion: k, was: a, now: b });
      });
    });
    if (rationale && rationale.value.trim()) c.push({ kind: 'rationale', text: rationale.value.trim() });
    return c;
  }

  function refresh() {
    const totals = computeTotals();
    let winnerIdx = -1;
    let max = -Infinity;
    totals.forEach((t, i) => { if (t > max) { max = t; winnerIdx = i; } });

    state.options.forEach((o, i) => {
      const bar = root.querySelector(`[data-dm-bar="${cssEscape(o.oid)}"]`);
      const val = root.querySelector(`[data-dm-total-val="${cssEscape(o.oid)}"]`);
      const head = root.querySelector(`[data-dm-opt="${cssEscape(o.oid)}"]`);
      const totalCell = root.querySelector(`[data-dm-total="${cssEscape(o.oid)}"]`);
      if (bar) bar.style.width = (totals[i] * 100).toFixed(1) + '%';
      if (val) val.textContent = (totals[i] * 100).toFixed(1);
      if (head) head.classList.toggle('dm-winner', i === winnerIdx);
      if (totalCell) totalCell.classList.toggle('dm-winner', i === winnerIdx);
    });
    if (recName) recName.textContent = winnerIdx >= 0 ? state.options[winnerIdx].name : '—';
    if (recScore) recScore.textContent = winnerIdx >= 0 ? `score ${(totals[winnerIdx] * 100).toFixed(1)}/100` : '';

    // Update cell heat colors
    root.querySelectorAll('[data-dm-cell]').forEach((cell) => {
      const [oid, cid] = cell.dataset.dmCell.split(':');
      const c = critByCid.get(cid); const o = optByOid.get(oid);
      if (!c || !o) return;
      const h = heatFor(o.scores[c.name], c.name);
      cell.style.setProperty('--heat', h == null ? 0 : h.toFixed(2));
      cell.className = `dm-cell dm-cell-${toneFor(h)}`;
    });

    const ch = changes();
    if (changedEl) changedEl.textContent = ch.length;
    if (fab) { fab.disabled = ch.length === 0; fab.setAttribute('aria-disabled', ch.length === 0 ? 'true' : 'false'); }
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Revised decision matrix for: "${state.question}".`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    const totals = computeTotals();
    let winnerIdx = -1; let max = -Infinity;
    totals.forEach((t, i) => { if (t > max) { max = t; winnerIdx = i; } });
    lines.push(`Original recommendation: ${state.original_recommendation || '(none)'}`);
    lines.push(`My recommendation: ${winnerIdx >= 0 ? state.options[winnerIdx].name : '(none)'} (score ${winnerIdx >= 0 ? (totals[winnerIdx] * 100).toFixed(1) : '—'}/100)`);
    lines.push('');
    const ch = changes();
    if (ch.length === 0) { lines.push('No changes to scores or weights.'); return lines.join('\n'); }
    lines.push('Changes:');
    ch.forEach((c, i) => {
      if (c.kind === 'weight') lines.push(`${i + 1}. Weight for "${c.criterion}": ${c.was} → ${c.now}`);
      else if (c.kind === 'score') lines.push(`${i + 1}. Score for "${c.option}" / "${c.criterion}": ${c.was ?? '—'} → ${c.now ?? '—'}`);
      else if (c.kind === 'rationale') {
        lines.push(`${i + 1}. Rationale:`);
        c.text.split('\n').forEach((l) => lines.push(`   ${l}`));
      }
    });
    lines.push(''); lines.push('Full revised scoring:'); lines.push('');
    lines.push('| Criterion | Weight | ' + state.options.map((o) => o.name).join(' | ') + ' |');
    lines.push('|---|---:|' + state.options.map(() => '---:').join('|') + '|');
    state.criteria.forEach((c) => {
      lines.push(`| ${c.name}${c.direction === 'lower_better' ? ' (↓)' : ''} | ${c.weight} | ` +
        state.options.map((o) => o.scores[c.name] ?? '').join(' | ') + ' |');
    });
    lines.push(`| **Total** |  | ${totals.map((t) => `**${(t * 100).toFixed(1)}**`).join(' | ')} |`);
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard) { try { await navigator.clipboard.writeText(text); return true; } catch {} }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta); return ok;
  }
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.removeAttribute('hidden'); void toast.offsetWidth;
    toast.classList.add('dm-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('dm-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (changes().length === 0) { showToast('No changes yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_:-]/g, (c) => '\\' + c);
  }

  // Score edits
  root.querySelectorAll('[data-dm-score]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const [oid, cid] = inp.dataset.dmScore.split(':');
      const c = critByCid.get(cid); const o = optByOid.get(oid);
      if (!c || !o) return;
      const v = inp.value.trim();
      o.scores[c.name] = v === '' ? null : parseFloat(v);
      if (typeof o.scores[c.name] === 'number' && !isFinite(o.scores[c.name])) o.scores[c.name] = null;
      refresh();
    });
  });
  // Weight edits
  root.querySelectorAll('[data-dm-weight]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const c = critByCid.get(inp.dataset.dmWeight); if (!c) return;
      const v = parseFloat(inp.value);
      c.weight = isFinite(v) ? v : 0;
      refresh();
    });
  });
  if (rationale) rationale.addEventListener('input', refresh);

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-dm-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-dm-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'decision-matrix',
    blockId: state.block_id || state.question,
    hasChanges: () => changes().length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
