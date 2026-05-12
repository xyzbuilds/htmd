(function () {
  const root = document.querySelector('main.rk');
  if (!root) return;
  const stateNode = root.querySelector('[data-rk-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const list = root.querySelector('[data-rk-list]');
  const fab = root.querySelector('[data-rk-copy]');
  const modal = root.querySelector('[data-rk-modal]');
  const modalText = root.querySelector('[data-rk-text]');
  const toast = root.querySelector('[data-rk-toast]');

  function currentOrder() {
    return Array.from(list.querySelectorAll('[data-rk-item]')).map((el) => el.dataset.rkItem);
  }
  function isChanged() {
    const cur = currentOrder();
    if (cur.length !== state.original_order.length) return true;
    for (let i = 0; i < cur.length; i++) if (cur[i] !== state.original_order[i]) return true;
    return false;
  }
  function refreshNumbers() {
    list.querySelectorAll('[data-rk-num]').forEach((el, i) => el.textContent = (i + 1));
    refresh();
  }
  function refresh() {
    if (fab) {
      const ch = isChanged();
      fab.disabled = !ch;
      fab.setAttribute('aria-disabled', ch ? 'false' : 'true');
    }
  }

  function move(li, delta) {
    if (!li) return;
    if (delta < 0 && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    else if (delta > 0 && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
    refreshNumbers();
  }

  list.addEventListener('click', (e) => {
    const up = e.target.closest('[data-rk-up]');
    const down = e.target.closest('[data-rk-down]');
    if (up) move(up.closest('[data-rk-item]'), -1);
    else if (down) move(down.closest('[data-rk-item]'), 1);
  });

  // Native HTML5 drag
  let dragging = null;
  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('[data-rk-item]');
    if (!li) return;
    dragging = li;
    li.classList.add('rk-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', li.dataset.rkItem); } catch {}
  });
  list.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('rk-dragging');
    list.querySelectorAll('.rk-drop-target').forEach((el) => el.classList.remove('rk-drop-target'));
    dragging = null;
    refreshNumbers();
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const li = e.target.closest('[data-rk-item]');
    if (!li || li === dragging) return;
    list.querySelectorAll('.rk-drop-target').forEach((el) => el.classList.remove('rk-drop-target'));
    li.classList.add('rk-drop-target');
    const r = li.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    if (before) list.insertBefore(dragging, li);
    else list.insertBefore(dragging, li.nextElementSibling);
  });

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Here is my preferred ranking for "${state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    const order = currentOrder();
    order.forEach((id, i) => {
      const it = state.items.find((x) => x.id === id);
      lines.push(`${i + 1}. ${it ? it.title : id}`);
    });
    if (isChanged()) {
      lines.push(''); lines.push('(reordered from agent\'s original suggested order)');
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
    toast.classList.add('rk-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('rk-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (!isChanged()) { showToast('Order unchanged'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-rk-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-rk-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'rank-order',
    blockId: state.block_id || state.title,
    hasChanges: () => isChanged(),
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
