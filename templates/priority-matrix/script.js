(function () {
  const root = document.querySelector('main.pm');
  if (!root) return;
  const stateNode = root.querySelector('[data-pm-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const idx = new Map();
  state.items.forEach((it) => idx.set(it.id, it));

  const fab = root.querySelector('[data-pm-copy]');
  const changedEl = root.querySelector('[data-pm-changed]');
  const modal = root.querySelector('[data-pm-modal]');
  const modalText = root.querySelector('[data-pm-text]');
  const toast = root.querySelector('[data-pm-toast]');

  function changedItems() {
    return state.items.filter((it) => it.quadrant !== it.original_quadrant);
  }
  function refresh() {
    const n = changedItems().length;
    if (changedEl) changedEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }

  let dragging = null;
  root.querySelectorAll('[data-pm-item]').forEach(wireDrag);

  function wireDrag(li) {
    li.addEventListener('dragstart', (e) => {
      dragging = li; li.classList.add('pm-dragging');
      try { e.dataTransfer.setData('text/plain', li.dataset.pmItem); } catch {}
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      if (dragging) dragging.classList.remove('pm-dragging');
      root.querySelectorAll('.pm-drop-on').forEach((el) => el.classList.remove('pm-drop-on'));
      dragging = null;
    });
  }

  root.querySelectorAll('[data-pm-quad], [data-pm-pool]').forEach((zone) => {
    const isPool = zone.matches('[data-pm-pool]');
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('pm-drop-on');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('pm-drop-on'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('pm-drop-on');
      if (!dragging) return;
      const id = dragging.dataset.pmItem;
      const it = idx.get(id); if (!it) return;
      it.quadrant = isPool ? '' : (zone.dataset.pmQuad || '');
      const targetList = zone.querySelector('[data-pm-list]');
      if (targetList) targetList.appendChild(dragging);
      refresh();
    });
  });

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Here's how I placed the items in "${state.title}".`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    for (const q of state.quadrants) {
      const inQuad = state.items.filter((it) => it.quadrant === q.id);
      lines.push(`${q.label}${q.hint ? ` (${q.hint})` : ''}:`);
      if (!inQuad.length) lines.push('  (none)');
      else for (const it of inQuad) lines.push(`  - ${it.title}`);
      lines.push('');
    }
    const unplaced = state.items.filter((it) => !it.quadrant);
    if (unplaced.length) {
      lines.push('Unplaced:');
      for (const it of unplaced) lines.push(`  - ${it.title}`);
      lines.push('');
    }
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
    toast.classList.add('pm-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('pm-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (changedItems().length === 0) { showToast('No changes yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-pm-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-pm-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'priority-matrix',
    blockId: state.block_id || state.title,
    hasChanges: () => changedItems().length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
