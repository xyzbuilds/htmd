(function () {
  const root = document.querySelector('main.fm');
  if (!root) return;
  const stateNode = root.querySelector('[data-fm-state]');
  if (!stateNode) return;
  let state; try { state = JSON.parse(stateNode.textContent); } catch { return; }

  const form = root.querySelector('[data-fm-form]');
  const fab = root.querySelector('[data-fm-submit]');
  const errEl = root.querySelector('[data-fm-err]');
  const modal = root.querySelector('[data-fm-modal]');
  const modalText = root.querySelector('[data-fm-text]');
  const toast = root.querySelector('[data-fm-toast]');

  function readValues() {
    const out = {};
    for (const f of state.fields) {
      if (f.type === 'checkbox') {
        const group = form.querySelectorAll(`[data-fm-cb="${cssEsc(f.name)}"]`);
        if (group.length) {
          out[f.name] = Array.from(group).filter((el) => el.checked).map((el) => el.value);
        } else {
          const el = form.querySelector(`[data-fm-name="${cssEsc(f.name)}"]`);
          out[f.name] = el ? !!el.checked : false;
        }
      } else if (f.type === 'radio') {
        const el = form.querySelector(`[data-fm-radio="${cssEsc(f.name)}"]:checked`);
        out[f.name] = el ? el.value : '';
      } else if (f.type === 'number') {
        const el = form.querySelector(`[data-fm-name="${cssEsc(f.name)}"]`);
        const v = el ? el.value : '';
        out[f.name] = v === '' ? null : Number(v);
      } else {
        const el = form.querySelector(`[data-fm-name="${cssEsc(f.name)}"]`);
        out[f.name] = el ? el.value : '';
      }
    }
    return out;
  }

  function validate(values) {
    const errs = [];
    for (const f of state.fields) {
      if (!f.required) continue;
      const v = values[f.name];
      const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v));
      if (empty) errs.push(f.label);
    }
    return errs;
  }

  function buildPrompt(values) {
    const lines = [];
    lines.push(state.prompt_intro || `Form submission: ${state.title}`);
    lines.push(''); lines.push(`Date: ${new Date().toISOString()}`); lines.push('');
    for (const f of state.fields) {
      const v = values[f.name];
      const out = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
      lines.push(`- ${f.label}: ${out}`);
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
    toast.classList.add('fm-toast-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.classList.remove('fm-toast-show'); setTimeout(() => toast.setAttribute('hidden', ''), 220); }, 1800);
  }
  function open() {
    const values = readValues();
    const errs = validate(values);
    form.querySelectorAll('.fm-field').forEach((el) => el.classList.remove('fm-invalid'));
    if (errs.length) {
      if (errEl) { errEl.textContent = 'Required: ' + errs.join(', '); errEl.removeAttribute('hidden'); }
      for (const name of state.fields.filter((f) => errs.includes(f.label)).map((f) => f.name)) {
        const fld = form.querySelector(`[data-fm-field="${cssEsc(name)}"]`);
        if (fld) fld.classList.add('fm-invalid');
      }
      return;
    }
    if (errEl) errEl.setAttribute('hidden', '');
    if (!modal) return; if (modalText) modalText.textContent = buildPrompt(values);
    modal.removeAttribute('hidden');
  }
  function close() { if (modal) modal.setAttribute('hidden', ''); }
  function cssEsc(v) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_:-]/g, (c) => '\\' + c);
  }

  if (fab) fab.addEventListener('click', open);
  root.querySelectorAll('[data-fm-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) close(); });
  const confirmBtn = root.querySelector('[data-fm-confirm]');
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const text = modalText ? modalText.textContent : buildPrompt(readValues());
    const ok = await copyText(text);
    close(); showToast(ok ? 'Copied' : 'Copy failed');
  });

  if (!window.__htmd) window.__htmd = { blocks: [] };
  window.__htmd.blocks.push({
    template: 'form',
    blockId: state.block_id || state.title,
    hasChanges: () => {
      const values = readValues();
      return Object.values(values).some((v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0) && v !== false);
    },
    getPrompt: () => buildPrompt(readValues())
  });
})();
