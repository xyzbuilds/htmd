(function () {
  const root = document.querySelector('main.cmp');
  if (!root) return;
  const stateNode = root.querySelector('[data-cmp-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const fab = root.querySelector('[data-cmp-copy]');
  const modal = root.querySelector('[data-cmp-modal]');
  const modalText = root.querySelector('[data-cmp-text]');
  const toast = root.querySelector('[data-cmp-toast]');
  const rationale = root.querySelector('[data-cmp-rationale]');

  function aById(aid) { return state.approaches.find((a) => a.aid === aid); }

  function isChanged() {
    if (state.chosen) return true;
    if ((state.rationale || '').trim()) return true;
    return state.approaches.some((a) => (a.note || '').trim() !== '');
  }
  function refresh() {
    if (fab) {
      const ch = isChanged();
      fab.disabled = !ch;
      fab.setAttribute('aria-disabled', ch ? 'false' : 'true');
    }
    // Visually mark the chosen column
    root.querySelectorAll('[data-cmp-col]').forEach((col) => col.classList.remove('cmp-chosen'));
    if (state.chosen && state.chosen !== '__none__') {
      const col = root.querySelector(`[data-cmp-col="${cssEscape(state.chosen)}"]`);
      if (col) col.classList.add('cmp-chosen');
    }
  }
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `My decision on "${state.title}".`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    if (state.suggested) lines.push(`Agent suggested: ${state.suggested}`);
    let chosenName = '(none picked)';
    if (state.chosen === '__none__') chosenName = 'None of the above';
    else if (state.chosen) {
      const a = aById(state.chosen);
      chosenName = a ? a.name : state.chosen;
    }
    lines.push(`I'd choose: ${chosenName}`);
    if ((state.rationale || '').trim()) {
      lines.push(''); lines.push('Rationale:'); state.rationale.split('\n').forEach((l) => lines.push(`  ${l}`));
    }
    const notes = state.approaches.filter((a) => (a.note || '').trim() !== '');
    if (notes.length) {
      lines.push(''); lines.push('Per-option notes:');
      notes.forEach((a) => { lines.push(`  ${a.name}:`); a.note.split('\n').forEach((l) => lines.push(`    ${l}`)); });
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
    toast.classList.add('cmp-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('cmp-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (!isChanged()) { showToast('Pick an option or add a note first'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  root.querySelectorAll('[data-cmp-pick]').forEach((r) => {
    r.addEventListener('change', () => { state.chosen = r.value; refresh(); });
  });
  root.querySelectorAll('[data-cmp-note]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const a = aById(ta.dataset.cmpNote); if (!a) return;
      a.note = ta.value;
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
      refresh();
    });
  });
  if (rationale) rationale.addEventListener('input', () => { state.rationale = rationale.value; refresh(); });

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-cmp-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-cmp-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'comparison-3-up',
    blockId: state.block_id || state.title,
    hasChanges: () => isChanged(),
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
