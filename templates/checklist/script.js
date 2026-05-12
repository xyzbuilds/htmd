(function () {
  const root = document.querySelector('main.cl');
  if (!root) return;
  const stateNode = root.querySelector('[data-cl-state]');
  if (!stateNode) return;
  let state;
  try { state = JSON.parse(stateNode.textContent); } catch (e) { return; }

  const idx = new Map();
  state.items.forEach((it) => idx.set(it.id, it));

  const fab = root.querySelector('[data-cl-copy]');
  const changedEl = root.querySelector('[data-cl-changed]');
  const doneEl = root.querySelector('[data-cl-done]');
  const modal = root.querySelector('[data-cl-modal]');
  const modalText = root.querySelector('[data-cl-text]');
  const toast = root.querySelector('[data-cl-toast]');

  function changedItems() {
    return state.items.filter((it) =>
      it.done !== it.original_done || (it.note || '').trim() !== (it.original_note || '').trim()
    );
  }
  function doneCount() { return state.items.filter((it) => it.done).length; }

  function refresh() {
    const ch = changedItems().length;
    if (changedEl) changedEl.textContent = ch;
    if (fab) { fab.disabled = ch === 0; fab.setAttribute('aria-disabled', ch === 0 ? 'true' : 'false'); }
    if (doneEl) doneEl.textContent = doneCount();
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `I worked through the "${state.title}" checklist; here is the resulting state.`);
    lines.push('');
    lines.push(`Date: ${new Date().toISOString()}`);
    lines.push(`Progress: ${doneCount()} of ${state.items.length} complete`);
    lines.push('');
    const ch = changedItems();
    if (ch.length === 0) {
      lines.push('No items changed since the agent generated this checklist.');
      return lines.join('\n');
    }
    lines.push('Changes:');
    let n = 0;
    for (const it of ch) {
      n++;
      const becameDone = it.done && !it.original_done;
      const becameUndone = !it.done && it.original_done;
      const noteChanged = (it.note || '').trim() !== (it.original_note || '').trim();
      lines.push(`${n}. ${it.title}`);
      if (becameDone) lines.push('   - Completed');
      if (becameUndone) lines.push('   - Re-opened (was previously marked done)');
      if (noteChanged) lines.push(`   - Note: ${(it.note || '').trim() || '(cleared)'}`);
      lines.push('');
    }
    lines.push('Please continue from here.');
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta); return ok;
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.removeAttribute('hidden'); void toast.offsetWidth;
    toast.classList.add('cl-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('cl-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }

  function open() {
    if (changedItems().length === 0) { showToast('No changes yet'); return; }
    if (!modal) return;
    if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  root.querySelectorAll('[data-cl-check]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const it = idx.get(cb.dataset.clCheck); if (!it) return;
      it.done = cb.checked;
      const li = cb.closest('.cl-item'); if (li) li.classList.toggle('cl-done', cb.checked);
      refresh();
    });
  });
  root.querySelectorAll('[data-cl-note]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const it = idx.get(ta.dataset.clNote); if (!it) return;
      it.note = ta.value;
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
      refresh();
    });
  });
  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-cl-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-cl-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close();
    showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  // Register with the compose-level export bridge so a parent compose page can
  // include this block's prompt in an aggregate "Copy all changes" action.
  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'checklist',
    blockId: state.block_id || state.title,
    hasChanges: () => changedItems().length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
