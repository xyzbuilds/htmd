(function () {
  const root = document.querySelector('main.prr');
  if (!root) return;
  const stateNode = root.querySelector('[data-prr-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const fab = root.querySelector('[data-prr-copy]');
  const countEl = root.querySelector('[data-prr-count]');
  const modal = root.querySelector('[data-prr-modal]');
  const modalText = root.querySelector('[data-prr-text]');
  const toast = root.querySelector('[data-prr-toast]');

  const changes = {};

  function effectiveResolved(file_id, c) {
    return c.id in changes ? changes[c.id] : c.resolved;
  }

  function refresh() {
    let changed = 0;
    for (const file of state.files) {
      let unresolved = 0;
      for (const c of file.comments) {
        const eff = effectiveResolved(file.file_id, c);
        if (eff !== c.resolved) changed++;
        if (!eff) unresolved++;
      }
      const fc = root.querySelector(`[data-prr-file-count="${cssEsc(file.file_id)}"]`);
      if (fc) fc.textContent = `${unresolved} unresolved`;
    }
    if (countEl) countEl.textContent = changed;
    if (fab) { fab.disabled = changed === 0; fab.setAttribute('aria-disabled', changed === 0 ? 'true' : 'false'); }
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `PR review for "${state.pr.title || state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    let any = false;
    for (const file of state.files) {
      const newlyResolved = file.comments.filter((c) => c.id in changes && changes[c.id] && !c.resolved);
      const reopened = file.comments.filter((c) => c.id in changes && !changes[c.id] && c.resolved);
      if (newlyResolved.length === 0 && reopened.length === 0) continue;
      any = true;
      lines.push(`File: ${file.path}`);
      for (const c of newlyResolved) lines.push(`  - Resolved L${c.line}: ${truncate(c.body, 80)}`);
      for (const c of reopened) lines.push(`  - Reopened L${c.line}: ${truncate(c.body, 80)}`);
      lines.push('');
    }
    if (!any) lines.push('(no changes)');
    lines.push('Please address the remaining unresolved comments.');
    return lines.join('\n');
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

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
    toast.classList.add('prr-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('prr-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (Object.keys(changes).length === 0) { showToast('No changes yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }
  function cssEsc(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_:-]/g, (c) => '\\' + c);
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-prr-resolve]');
    if (!btn) return;
    const id = btn.dataset.prrResolve;
    let cur = null;
    for (const file of state.files) {
      const c = file.comments.find((cc) => cc.id === id);
      if (c) { cur = effectiveResolved(file.file_id, c); break; }
    }
    const next = !cur;
    changes[id] = next;
    let original = null;
    for (const file of state.files) {
      const c = file.comments.find((cc) => cc.id === id);
      if (c) { original = c.resolved; break; }
    }
    if (next === original) delete changes[id];
    btn.setAttribute('aria-pressed', next ? 'true' : 'false');
    btn.textContent = next ? 'Resolved' : 'Mark resolved';
    const li = btn.closest('.prr-comment');
    if (li) li.classList.toggle('prr-resolved', next);
    refresh();
  });

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-prr-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-prr-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'pr-review',
    blockId: state.block_id || state.title,
    hasChanges: () => Object.keys(changes).length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
