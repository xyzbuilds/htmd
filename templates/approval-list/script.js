(function () {
  const root = document.querySelector('main.al');
  if (!root) return;
  const stateNode = root.querySelector('[data-al-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const idx = new Map();
  state.items.forEach((it) => idx.set(it.id, it));
  const actionByValue = new Map();
  state.actions.forEach((a) => actionByValue.set(a.value, a));

  const fab = root.querySelector('[data-al-copy]');
  const countEl = root.querySelector('[data-al-count]');
  const decEl = root.querySelector('[data-al-decided]');
  const modal = root.querySelector('[data-al-modal]');
  const modalText = root.querySelector('[data-al-text]');
  const toast = root.querySelector('[data-al-toast]');

  function decided(it) { return !!it.decision; }
  function decidedCount() { return state.items.filter(decided).length; }

  function refresh() {
    const n = decidedCount();
    if (countEl) countEl.textContent = n;
    if (decEl) decEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }

  function updateItemUi(itemId) {
    const it = idx.get(itemId); if (!it) return;
    const card = root.querySelector(`[data-al-item="${cssEscape(itemId)}"]`);
    if (!card) return;
    card.classList.toggle('al-decided', decided(it));
    const action = actionByValue.get(it.decision);
    if (action) card.style.setProperty('--al-color', action.color || 'var(--htmd-accent)');
    card.querySelectorAll('[data-al-decision]').forEach((btn) => {
      const sel = btn.dataset.alDecision === it.decision;
      btn.setAttribute('aria-checked', sel ? 'true' : 'false');
    });
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Decisions on "${state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    let n = 0;
    for (const it of state.items) {
      if (!decided(it)) continue;
      n++;
      const action = actionByValue.get(it.decision);
      lines.push(`${n}. ${it.title}`);
      lines.push(`   Decision: ${action ? action.label : it.decision}`);
      const r = (it.reason || '').trim();
      if (r) lines.push(`   Reason: ${r}`);
      lines.push('');
    }
    if (n === 0) lines.push('(no decisions made)');
    else lines.push('Please proceed accordingly.');
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
    toast.classList.add('al-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('al-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (decidedCount() === 0) { showToast('No decisions yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  root.querySelectorAll('[data-al-decision]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.alDecisionItem;
      const value = btn.dataset.alDecision;
      const it = idx.get(itemId); if (!it) return;
      it.decision = it.decision === value ? '' : value;
      updateItemUi(itemId);
      refresh();
    });
  });
  root.querySelectorAll('[data-al-reason]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const it = idx.get(ta.dataset.alReason); if (!it) return;
      it.reason = ta.value;
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    });
  });
  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-al-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-al-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'approval-list',
    blockId: state.block_id || state.title,
    hasChanges: () => decidedCount() > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
