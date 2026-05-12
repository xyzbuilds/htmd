(function () {
  const root = document.querySelector('main.qa');
  if (!root) return;
  const stateNode = root.querySelector('[data-qa-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch (e) { return; }

  const idx = new Map();
  state.questions.forEach((q) => idx.set(q.id, q));

  const fab = root.querySelector('[data-qa-copy]');
  const countEl = root.querySelector('[data-qa-count]');
  const ansEl = root.querySelector('[data-qa-answered]');
  const modal = root.querySelector('[data-qa-modal]');
  const modalText = root.querySelector('[data-qa-text]');
  const toast = root.querySelector('[data-qa-toast]');

  function isAnswered(q) {
    if (q.kind === 'multi') return Array.isArray(q.answer) && q.answer.length > 0;
    return (q.answer || '').toString().trim() !== '';
  }
  function answeredCount() { return state.questions.filter(isAnswered).length; }

  function refresh() {
    const n = answeredCount();
    if (countEl) countEl.textContent = n;
    if (ansEl) ansEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Here are answers to the clarifying questions for "${state.title}".`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    let n = 0;
    for (const q of state.questions) {
      n++;
      lines.push(`${n}. ${q.prompt}`);
      if (!isAnswered(q)) { lines.push('   Answer: (skipped)'); }
      else if (Array.isArray(q.answer)) { lines.push(`   Answer: ${q.answer.join(', ')}`); }
      else { lines.push(`   Answer: ${q.answer}`); }
      lines.push('');
    }
    lines.push('Please proceed using these answers.');
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
    toast.classList.add('qa-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('qa-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (answeredCount() === 0) { showToast('No answers yet'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  root.querySelectorAll('[data-qa-input]').forEach((el) => {
    const evt = el.tagName === 'TEXTAREA' || el.type === 'text' ? 'input' : 'change';
    el.addEventListener(evt, () => {
      const id = el.dataset.qaInput;
      const q = idx.get(id); if (!q) return;
      const kind = el.dataset.qaKind || q.kind;
      if (kind === 'multi') {
        const all = root.querySelectorAll(`[data-qa-input="${id}"]:checked`);
        q.answer = Array.from(all).map((n) => n.value);
      } else if (kind === 'single') {
        q.answer = el.value;
      } else {
        q.answer = el.value;
      }
      refresh();
    });
  });

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-qa-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-qa-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'q-and-a',
    blockId: state.block_id || state.title,
    hasChanges: () => answeredCount() > 0,
    getPrompt: () => buildPrompt()
  });

  refresh();
})();
