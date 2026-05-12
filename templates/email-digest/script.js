(function () {
  const root = document.querySelector('main.ed');
  if (!root) return;
  const stateNode = root.querySelector('[data-ed-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const idx = new Map();
  state.items.forEach((it) => idx.set(it.id, it));
  const actByVal = new Map();
  state.actions.forEach((a) => actByVal.set(a.value, a));

  const fab = root.querySelector('[data-ed-copy]');
  const countEl = root.querySelector('[data-ed-count]');
  const modal = root.querySelector('[data-ed-modal]');
  const modalText = root.querySelector('[data-ed-text]');
  const toast = root.querySelector('[data-ed-toast]');

  function decided() { return state.items.filter((it) => !!it.action); }
  function refresh() {
    const n = decided().length;
    if (countEl) countEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }
  function updateUi(itemId) {
    const it = idx.get(itemId); if (!it) return;
    const li = root.querySelector(`[data-ed-item="${cssEscape(itemId)}"]`);
    if (!li) return;
    li.classList.toggle('ed-decided', !!it.action);
    li.querySelectorAll('[data-ed-action]').forEach((b) => {
      const sel = b.dataset.edAction === it.action;
      b.setAttribute('aria-checked', sel ? 'true' : 'false');
    });
    const note = li.querySelector('[data-ed-note]');
    if (note) {
      if (it.action === 'reply' || it.action === 'forward') note.removeAttribute('hidden');
      else note.setAttribute('hidden', '');
    }
  }
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Inbox actions for ${state.date || 'today'}:`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    let n = 0;
    for (const it of state.items) {
      if (!it.action) continue;
      n++;
      const action = actByVal.get(it.action);
      lines.push(`${n}. [${it.section}] ${it.from} — ${it.subject}`);
      lines.push(`   Action: ${action ? action.label : it.action}`);
      if (it.agent_action && it.action !== it.agent_action.toLowerCase()) {
        lines.push(`   (agent suggested: ${it.agent_action})`);
      }
      const note = (it.note || '').trim();
      if (note) lines.push(`   Note: ${note}`);
      lines.push('');
    }
    if (n === 0) lines.push('(no actions taken)');
    else lines.push('Please process these actions.');
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
    toast.classList.add('ed-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('ed-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (decided().length === 0) { showToast('Pick an action on at least one email'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  root.querySelectorAll('[data-ed-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.edActionItem;
      const value = btn.dataset.edAction;
      const it = idx.get(itemId); if (!it) return;
      it.action = it.action === value ? '' : value;
      updateUi(itemId); refresh();
    });
  });
  root.querySelectorAll('[data-ed-note]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const it = idx.get(ta.dataset.edNote); if (!it) return;
      it.note = ta.value;
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    });
  });
  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-ed-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-ed-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'email-digest',
    blockId: state.block_id || state.date,
    hasChanges: () => decided().length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
