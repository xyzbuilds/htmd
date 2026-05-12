(function () {
  const stateNode = document.querySelector('[data-fc-state]');
  if (!stateNode) return;

  let state;
  try {
    state = JSON.parse(stateNode.textContent);
  } catch (e) {
    console.error('feedback-corrector: failed to parse state', e);
    return;
  }

  // Index items by id for fast lookup.
  const itemIndex = new Map();
  state.items.forEach((it) => itemIndex.set(it.id, it));

  const labelByValue = new Map();
  state.labels.forEach((l) => labelByValue.set(l.value, l));

  const fab = document.querySelector('[data-fc-copy]');
  const counterEl = document.querySelector('[data-fc-modified-count]');
  const modal = document.querySelector('[data-fc-modal]');
  const modalText = document.querySelector('[data-fc-modal-text]');
  const toast = document.querySelector('[data-fc-toast]');

  // -------- helpers --------
  function isModified(item) {
    return item.current_label !== item.original_label || (item.clarification && item.clarification.trim() !== '');
  }

  function modifiedCount() {
    let n = 0;
    for (const it of state.items) if (isModified(it)) n++;
    return n;
  }

  function updateCounter() {
    const n = modifiedCount();
    if (counterEl) counterEl.textContent = n;
    if (fab) {
      fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false');
      fab.disabled = n === 0;
    }
  }

  function updateItemUi(itemId) {
    const item = itemIndex.get(itemId);
    if (!item) return;
    const card = document.querySelector(`[data-fc-item="${cssEscape(itemId)}"]`);
    if (!card) return;

    // Toggle modified styling + tag
    const modified = isModified(item);
    card.classList.toggle('fc-modified', modified);
    const tag = card.querySelector('[data-fc-modified-tag]');
    if (tag) {
      if (modified) tag.removeAttribute('hidden');
      else tag.setAttribute('hidden', '');
    }

    // Refresh pill selection state
    card.querySelectorAll('[data-fc-pill]').forEach((btn) => {
      const selected = btn.dataset.fcPill === item.current_label;
      btn.classList.toggle('fc-pill-selected', selected);
      btn.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  function showToast(msg, ms) {
    if (!toast) return;
    toast.textContent = msg;
    toast.removeAttribute('hidden');
    // force reflow then add show class
    void toast.offsetWidth;
    toast.classList.add('fc-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('fc-toast-show');
      setTimeout(() => toast.setAttribute('hidden', ''), 220);
    }, ms || 1800);
  }

  // -------- prompt assembly --------
  function buildPrompt() {
    const lines = [];
    const intro = state.prompt_intro || 'I reviewed the following classifications and have corrections to share.';
    lines.push(intro.trim());
    lines.push('');
    if (state.context_id) lines.push(`Context: ${state.context_id}`);
    lines.push(`Date: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('The following classifications need to be corrected:');
    lines.push('');

    let n = 0;
    for (const it of state.items) {
      if (!isModified(it)) continue;
      n++;
      const wasLbl = labelByValue.get(it.original_label);
      const newLbl = labelByValue.get(it.current_label);
      const wasName = wasLbl ? wasLbl.label : it.original_label;
      const newName = newLbl ? newLbl.label : it.current_label;
      const titleStr = it.title || `(item ${it.id})`;
      lines.push(`${n}. Item: "${titleStr}"`);
      if (it.subtitle) lines.push(`   Subtitle: ${it.subtitle}`);
      lines.push(`   Was classified as: ${wasName}`);
      lines.push(`   Should be: ${newName}`);
      const clar = (it.clarification || '').trim();
      lines.push(`   Clarification: ${clar || '(none)'}`);
      lines.push('');
    }

    lines.push('Please update the classifier accordingly.');
    return lines.join('\n');
  }

  // Optional template substitution if user provided one.
  function buildPromptWithTemplate() {
    if (!state.prompt_template) return buildPrompt();
    const itemsBlock = state.items.filter(isModified).map((it, idx) => {
      const wasLbl = labelByValue.get(it.original_label);
      const newLbl = labelByValue.get(it.current_label);
      const wasName = wasLbl ? wasLbl.label : it.original_label;
      const newName = newLbl ? newLbl.label : it.current_label;
      const clar = (it.clarification || '').trim() || '(none)';
      return `${idx + 1}. Item: "${it.title || it.id}"\n   Was: ${wasName}\n   Should be: ${newName}\n   Clarification: ${clar}`;
    }).join('\n\n');
    return state.prompt_template
      .replace(/\{intro\}/g, state.prompt_intro || '')
      .replace(/\{context_id\}/g, state.context_id || '')
      .replace(/\{date\}/g, new Date().toISOString())
      .replace(/\{items\}/g, itemsBlock);
  }

  function assemble() {
    return state.prompt_template ? buildPromptWithTemplate() : buildPrompt();
  }

  // -------- copy --------
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // fall through to fallback
      }
    }
    // Fallback for older Safari: hidden textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.top = '0';
    ta.style.left = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  // -------- modal --------
  function openModal() {
    if (modifiedCount() === 0) {
      showToast('No changes to copy yet');
      return;
    }
    if (!modal) return;
    const text = assemble();
    if (modalText) modalText.textContent = text;
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (!modal) return;
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  // -------- event wiring --------
  // Pills: clicking one selects it as the new label for that item.
  document.querySelectorAll('[data-fc-pill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.fcPillItem;
      const value = btn.dataset.fcPill;
      const item = itemIndex.get(itemId);
      if (!item) return;
      item.current_label = value;
      updateItemUi(itemId);
      updateCounter();
    });
  });

  // Clarifications
  const debouncedCounter = debounce(updateCounter, 150);
  document.querySelectorAll('[data-fc-clar]').forEach((ta) => {
    ta.addEventListener('input', () => {
      const itemId = ta.dataset.fcClar;
      const item = itemIndex.get(itemId);
      if (!item) return;
      item.clarification = ta.value;
      // Auto-grow rows up to a cap
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
      // Modified state may have flipped if clarification went 0 ↔ non-empty
      const card = document.querySelector(`[data-fc-item="${cssEscape(itemId)}"]`);
      if (card) {
        const mod = isModified(item);
        card.classList.toggle('fc-modified', mod);
        const tag = card.querySelector('[data-fc-modified-tag]');
        if (tag) {
          if (mod) tag.removeAttribute('hidden');
          else tag.setAttribute('hidden', '');
        }
      }
      debouncedCounter();
    });
  });

  // FAB
  if (fab) fab.addEventListener('click', openModal);

  // Modal close
  document.querySelectorAll('[data-fc-modal-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) closeModal();
  });

  // Confirm copy
  const confirmBtn = document.querySelector('[data-fc-confirm-copy]');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const text = modalText ? modalText.textContent : assemble();
      const ok = await copyText(text);
      closeModal();
      showToast(ok ? 'Copied!' : 'Copy failed — see console');
      if (!ok) console.log(text);
    });
  }

  // Register with the compose-level export bridge so that a parent compose
  // page can include this block's prompt in the global "Copy all changes" FAB.
  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'feedback-corrector',
    blockId: state.context_id || '',
    hasChanges: () => modifiedCount() > 0,
    getPrompt: () => assemble()
  });

  updateCounter();
})();
