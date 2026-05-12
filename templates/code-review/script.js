(function () {
  const root = document.querySelector('main.cr');
  if (!root) return;
  const stateNode = root.querySelector('[data-cr-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const fab = root.querySelector('[data-cr-copy]');
  const countEl = root.querySelector('[data-cr-count]');
  const modal = root.querySelector('[data-cr-modal]');
  const modalText = root.querySelector('[data-cr-text]');
  const toast = root.querySelector('[data-cr-toast]');

  const userComments = []; // { fileId, path, line, body }

  function refresh() {
    const n = userComments.filter((c) => (c.body || '').trim() !== '').length;
    if (countEl) countEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Code review for "${state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    const valid = userComments.filter((c) => (c.body || '').trim() !== '');
    if (valid.length === 0) lines.push('(no comments)');
    let n = 0;
    for (const c of valid) {
      n++;
      lines.push(`${n}. ${c.path}:${c.line}`);
      lines.push(`   ${c.body.trim()}`);
      lines.push('');
    }
    lines.push('Please address these comments.');
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
    toast.classList.add('cr-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('cr-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (userComments.filter((c) => (c.body || '').trim() !== '').length === 0) { showToast('No comments yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_:-]/g, (c) => '\\' + c);
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cr-add-comment]');
    if (!btn) return;
    const [fileId, lineStr] = btn.dataset.crAddComment.split(':');
    const line = parseInt(lineStr, 10);
    const ul = root.querySelector(`[data-cr-user-comments="${cssEscape(fileId + ':' + line)}"]`);
    if (!ul) return;
    const file = state.files.find((f) => f.file_id === fileId);
    const path = file ? file.path : fileId;
    const li = document.createElement('li');
    li.className = 'cr-comment cr-comment-edit';
    const ta = document.createElement('textarea');
    ta.placeholder = 'Comment for the agent…';
    ta.rows = 2;
    const actions = document.createElement('div');
    actions.className = 'cr-comment-actions';
    const save = document.createElement('button');
    save.className = 'cr-btn-mini cr-btn-mini-primary';
    save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.className = 'cr-btn-mini';
    cancel.textContent = 'Cancel';
    actions.append(save, cancel);
    li.append(ta, actions);
    ul.append(li);
    ta.focus();

    const entry = { fileId, path, line, body: '' };
    userComments.push(entry);
    refresh();
    const finalize = () => {
      entry.body = ta.value;
      li.classList.remove('cr-comment-edit');
      li.innerHTML = '';
      const text = document.createElement('div');
      text.textContent = `${path}:${line} — ${entry.body}`;
      li.append(text);
      refresh();
    };
    save.addEventListener('click', finalize);
    cancel.addEventListener('click', () => {
      const i = userComments.indexOf(entry);
      if (i >= 0) userComments.splice(i, 1);
      li.remove();
      refresh();
    });
    ta.addEventListener('input', () => {
      entry.body = ta.value;
      refresh();
    });
  });

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-cr-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-cr-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'code-review',
    blockId: state.block_id || state.title,
    hasChanges: () => userComments.filter((c) => (c.body || '').trim() !== '').length > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
