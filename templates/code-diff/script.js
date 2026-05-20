(function () {
  const root = document.querySelector('main.cdf');
  if (!root) return;
  const stateNode = root.querySelector('[data-cdf-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const fab = root.querySelector('[data-cdf-copy]');
  const countEl = root.querySelector('[data-cdf-count]');
  const modal = root.querySelector('[data-cdf-modal]');
  const modalText = root.querySelector('[data-cdf-text]');
  const toast = root.querySelector('[data-cdf-toast]');

  const decisions = {};

  function refresh() {
    const n = Object.values(decisions).filter(Boolean).length;
    if (countEl) countEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Diff review for "${state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    const grouped = {};
    for (const [hid, dec] of Object.entries(decisions)) {
      if (!dec) continue;
      const [fid] = hid.split(':');
      (grouped[fid] = grouped[fid] || []).push({ hid, dec });
    }
    if (Object.keys(grouped).length === 0) { lines.push('(no decisions)'); }
    for (const [fid, list] of Object.entries(grouped)) {
      const file = state.files.find((f) => f.file_id === fid);
      lines.push(`File: ${file ? file.path : fid}`);
      for (const { hid, dec } of list) {
        const idx = hid.split(':')[1];
        lines.push(`  - ${idx}: ${dec.toUpperCase()}`);
      }
      lines.push('');
    }
    lines.push('Please apply the accepted hunks and discard the rejected ones.');
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
    toast.classList.add('cdf-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('cdf-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (Object.values(decisions).filter(Boolean).length === 0) { showToast('No decisions yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cdf-decide]');
    if (!btn) return;
    const hid = btn.dataset.cdfTarget;
    const dec = btn.dataset.cdfDecide;
    const prev = decisions[hid];
    if (prev === dec) {
      delete decisions[hid];
    } else {
      decisions[hid] = dec;
    }
    const hunk = root.querySelector(`[data-cdf-hunk="${cssEsc(hid)}"]`);
    if (hunk) {
      hunk.querySelectorAll('[data-cdf-decide]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.cdfDecide === decisions[hid] ? 'true' : 'false'));
      const statusEl = hunk.querySelector('[data-cdf-status]');
      if (statusEl) statusEl.textContent = decisions[hid] ? decisions[hid] : '';
    }
    refresh();
  });

  function cssEsc(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_:-]/g, (c) => '\\' + c);
  }

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-cdf-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-cdf-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'code-diff',
    blockId: state.block_id || state.title,
    hasChanges: () => Object.values(decisions).filter(Boolean).length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
