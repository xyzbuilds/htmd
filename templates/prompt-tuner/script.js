(function () {
  const root = document.querySelector('main.pt');
  if (!root) return;
  const stateNode = root.querySelector('[data-pt-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch (e) { console.error('prompt-tuner: bad state JSON', e); return; }

  const tplInput = root.querySelector('[data-pt-template]');
  const fab = root.querySelector('[data-pt-copy-all]');
  const changedEl = root.querySelector('[data-pt-changed]');
  const modal = root.querySelector('[data-pt-modal]');
  const modalText = root.querySelector('[data-pt-text]');
  const toast = root.querySelector('[data-pt-toast]');

  let currentTemplate = state.original_template;
  // Per-sample var values + preferred flag
  const sampleState = {};
  state.samples.forEach((s) => {
    const vars = {};
    state.variables.forEach((v) => {
      vars[v.name] = (s.vars && s.vars[v.name] != null) ? s.vars[v.name] : (v.default ?? '');
    });
    sampleState[s.sid] = { name: s.name, original_vars: { ...vars }, vars, preferred: false };
  });

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function fillTemplate(tpl, vars) {
    return tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name) => (vars[name] != null && vars[name] !== '' ? vars[name] : ''));
  }
  function renderPreview(sid) {
    const out = root.querySelector(`[data-pt-output="${sid}"]`);
    if (!out) return;
    const vars = sampleState[sid].vars;
    let h = escapeHtml(currentTemplate);
    h = h.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) => {
      const v = vars[name];
      if (v == null || v === '') return `<span class="pt-missing">&#123;&#123;${escapeHtml(name)}&#125;&#125;</span>`;
      return `<mark>${escapeHtml(v)}</mark>`;
    });
    out.innerHTML = h;
  }
  function renderAll() {
    Object.keys(sampleState).forEach(renderPreview);
  }

  function hasChanges() {
    if (currentTemplate !== state.original_template) return true;
    if (Object.values(sampleState).some((s) => s.preferred)) return true;
    return Object.values(sampleState).some((s) =>
      state.variables.some((v) => (s.vars[v.name] ?? '') !== (s.original_vars[v.name] ?? ''))
    );
  }

  function refresh() {
    let n = 0;
    if (currentTemplate !== state.original_template) n++;
    n += Object.values(sampleState).filter((s) =>
      state.variables.some((v) => (s.vars[v.name] ?? '') !== (s.original_vars[v.name] ?? ''))
    ).length;
    if (Object.values(sampleState).some((s) => s.preferred)) n++;
    if (changedEl) changedEl.textContent = n;
    if (fab) { fab.disabled = n === 0; fab.setAttribute('aria-disabled', n === 0 ? 'true' : 'false'); }
  }

  function buildPrompt() {
    const lines = [];
    lines.push(state.prompt_intro || `Tuned prompt template for "${state.title}":`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    const templateChanged = currentTemplate !== state.original_template;
    if (templateChanged) {
      lines.push('Template (revised):'); lines.push('```');
      currentTemplate.split('\n').forEach((l) => lines.push(l));
      lines.push('```'); lines.push('');
    } else {
      lines.push('Template: unchanged.'); lines.push('');
    }

    const preferred = Object.entries(sampleState).filter(([, s]) => s.preferred);
    if (preferred.length) {
      lines.push(`Preferred sample(s): ${preferred.map(([, s]) => s.name).join(', ')}`);
      lines.push('');
    }

    const changedSamples = Object.entries(sampleState).filter(([, s]) =>
      state.variables.some((v) => (s.vars[v.name] ?? '') !== (s.original_vars[v.name] ?? ''))
    );
    if (changedSamples.length) {
      lines.push('Variable changes per sample:');
      changedSamples.forEach(([, s]) => {
        lines.push(`  ${s.name}:`);
        state.variables.forEach((v) => {
          const a = s.original_vars[v.name] ?? '';
          const b = s.vars[v.name] ?? '';
          if (a !== b) lines.push(`    ${v.name}: ${a || '(empty)'} → ${b || '(empty)'}`);
        });
      });
      lines.push('');
    }

    if (preferred.length) {
      const [, sample] = preferred[0];
      lines.push('Final rendered prompt (from preferred sample):'); lines.push('```');
      fillTemplate(currentTemplate, sample.vars).split('\n').forEach((l) => lines.push(l));
      lines.push('```');
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
    toast.classList.add('pt-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('pt-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    if (!hasChanges()) { showToast('Make a tweak first, then send back'); return; }
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt();
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }

  // ----- init -----
  tplInput.value = currentTemplate;
  // Fill per-sample var textareas
  state.samples.forEach((s) => {
    state.variables.forEach((v) => {
      const inp = root.querySelector(`[data-pt-var="${s.sid}:${cssEscape(v.name)}"]`);
      if (inp) inp.value = sampleState[s.sid].vars[v.name];
    });
  });
  function cssEscape(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  }

  tplInput.addEventListener('input', () => { currentTemplate = tplInput.value; renderAll(); refresh(); });
  root.querySelectorAll('[data-pt-var]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const [sid, name] = inp.dataset.ptVar.split(':');
      if (!sampleState[sid]) return;
      sampleState[sid].vars[name] = inp.value;
      // Auto-grow rows
      inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 200) + 'px';
      renderPreview(sid); refresh();
    });
    // Initial auto-grow
    inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 200) + 'px';
  });
  root.querySelectorAll('[data-pt-star]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.ptStar;
      // Toggle: clear all others (single preferred), set this one if not already
      const wasPref = sampleState[sid].preferred;
      Object.values(sampleState).forEach((s) => { s.preferred = false; });
      root.querySelectorAll('[data-pt-star]').forEach((b) => b.classList.remove('pt-star-on'));
      root.querySelectorAll('[data-pt-sample]').forEach((c) => c.classList.remove('pt-sample-pref'));
      if (!wasPref) {
        sampleState[sid].preferred = true;
        btn.classList.add('pt-star-on');
        const card = root.querySelector(`[data-pt-sample="${cssEscape(sid)}"]`);
        if (card) card.classList.add('pt-sample-pref');
      }
      refresh();
    });
  });
  root.querySelectorAll('[data-pt-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.ptCopy;
      const text = fillTemplate(currentTemplate, sampleState[sid].vars);
      const ok = await copyText(text);
      const orig = btn.textContent;
      btn.textContent = ok ? 'Copied!' : 'Failed';
      btn.classList.toggle('copied', ok);
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
    });
  });

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-pt-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-pt-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt();
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
    if (!ok) console.log(text);
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'prompt-tuner',
    blockId: state.block_id || state.title,
    hasChanges: () => hasChanges(),
    getPrompt: () => buildPrompt()
  });

  renderAll();
  refresh();
})();
