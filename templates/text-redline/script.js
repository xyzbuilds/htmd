(function () {
  const root = document.querySelector('main.tr');
  if (!root) return;
  const stateNode = root.querySelector('[data-tr-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const idx = new Map();
  state.segments.forEach((s) => idx.set(s.id, s));

  const fab = root.querySelector('[data-tr-copy]');
  const changedEl = root.querySelector('[data-tr-changed]');
  const modal = root.querySelector('[data-tr-modal]');
  const modalText = root.querySelector('[data-tr-text]');
  const toast = root.querySelector('[data-tr-toast]');

  function isChanged(s) {
    return s.edited.trim() !== s.original.trim() || (s.comment || '').trim() !== '' || s.accepted === false;
  }
  function changedCount() { return state.segments.filter(isChanged).length; }
  function refresh() {
    const n = changedCount();
    if (changedEl) changedEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }
  function updateUi(id) {
    const s = idx.get(id); if (!s) return;
    const seg = root.querySelector(`[data-tr-seg="${cssEscape(id)}"]`);
    if (!seg) return;
    seg.classList.toggle('tr-rejected', s.accepted === false);
    seg.classList.toggle('tr-edited', s.accepted !== false && s.edited.trim() !== s.original.trim());
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `I redlined the draft "${state.title}".`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    lines.push('Final text (with rejections removed and edits applied):'); lines.push('');
    for (const s of state.segments) {
      if (s.accepted === false) continue;
      lines.push(s.edited.trim());
      lines.push('');
    }
    const ch = state.segments.filter(isChanged);
    if (ch.length) {
      lines.push('---'); lines.push(''); lines.push('Change log:'); lines.push('');
      let n = 0;
      for (const s of ch) {
        n++;
        if (s.accepted === false) {
          lines.push(`${n}. REJECTED — "${s.original.trim().slice(0, 100)}…"`);
        } else if (s.edited.trim() !== s.original.trim()) {
          lines.push(`${n}. EDITED`);
          lines.push(`   Was: ${s.original.trim()}`);
          lines.push(`   Now: ${s.edited.trim()}`);
        } else {
          lines.push(`${n}. COMMENT on: "${s.original.trim().slice(0, 100)}…"`);
        }
        const c = (s.comment || '').trim();
        if (c) lines.push(`   Comment: ${c}`);
        lines.push('');
      }
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
    toast.classList.add('tr-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('tr-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (changedCount() === 0) { showToast('No edits yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  root.querySelectorAll('[data-tr-text]').forEach((el) => {
    el.addEventListener('input', () => {
      const s = idx.get(el.dataset.trText); if (!s) return;
      s.edited = el.innerText.replace(/ /g, ' ');
      updateUi(s.id); refresh();
    });
  });
  root.querySelectorAll('[data-tr-reject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.trReject;
      const s = idx.get(id); if (!s) return;
      s.accepted = !(s.accepted === false) ? false : true;
      updateUi(id); refresh();
    });
  });
  root.querySelectorAll('[data-tr-comment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.trComment;
      const ta = root.querySelector(`[data-tr-comment-input="${cssEscape(id)}"]`);
      if (!ta) return;
      ta.toggleAttribute('hidden');
      if (!ta.hasAttribute('hidden')) ta.focus();
    });
  });
  root.querySelectorAll('[data-tr-comment-input]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const s = idx.get(ta.dataset.trCommentInput); if (!s) return;
      s.comment = ta.value;
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
      refresh();
    });
  });
  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-tr-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-tr-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'text-redline',
    blockId: state.block_id || state.title,
    hasChanges: () => changedCount() > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
