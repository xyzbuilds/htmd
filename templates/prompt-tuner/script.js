(function () {
  const stateNode = document.querySelector('[data-pt-state]');
  if (!stateNode) return;
  const state = JSON.parse(stateNode.textContent);
  const tplInput = document.querySelector('[data-pt-template]');
  tplInput.value = state.template;

  // Initialize variable inputs from sample defaults.
  state.samples.forEach((s, i) => {
    state.variables.forEach((v) => {
      const value = (s.vars && s.vars[v.name]) ?? v.default ?? '';
      const inp = document.querySelector(`[data-pt-var="${i}:${v.name}"]`);
      if (inp) inp.value = value;
    });
  });

  function escape(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function render(i) {
    const tpl = tplInput.value;
    const out = document.querySelector(`[data-pt-output="${i}"]`);
    if (!out) return;
    let html = escape(tpl);
    html = html.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) => {
      const inp = document.querySelector(`[data-pt-var="${i}:${name}"]`);
      const v = inp ? inp.value : '';
      if (v === '' || v == null) return `<span class="pt-missing">{{${escape(name)}}}</span>`;
      return `<mark>${escape(v)}</mark>`;
    });
    out.innerHTML = html;
  }
  function rawOutput(i) {
    const tpl = tplInput.value;
    return tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) => {
      const inp = document.querySelector(`[data-pt-var="${i}:${name}"]`);
      return inp ? inp.value : '';
    });
  }

  function renderAll() {
    state.samples.forEach((_, i) => render(i));
  }
  renderAll();

  tplInput.addEventListener('input', renderAll);
  document.querySelectorAll('[data-pt-var]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const [i] = inp.dataset.ptVar.split(':');
      render(parseInt(i, 10));
    });
  });
  document.querySelectorAll('[data-pt-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.ptCopy, 10);
      const text = rawOutput(i);
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1200);
      } catch {
        btn.textContent = 'Press Ctrl+C';
      }
    });
  });
})();
