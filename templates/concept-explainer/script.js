(function () {
  const node = document.querySelector('[data-ce-glossary]');
  if (!node) return;
  let glossary = {};
  try { glossary = JSON.parse(node.textContent); } catch { return; }
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return;

  // Walk text nodes inside .ce-prose, wrap glossary terms.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(${terms.map(escapeRe).join('|')})\\b`, 'g');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (!pattern.test(text)) { pattern.lastIndex = 0; return; }
      pattern.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
        const span = document.createElement('span');
        span.className = 'ce-glossary-term';
        span.tabIndex = 0;
        span.innerHTML = escapeHtml(m[0]) + `<span class="ce-glossary-tooltip">${escapeHtml(glossary[m[0]])}</span>`;
        frag.appendChild(span);
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      node.parentNode.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'A', 'DT', 'DD'].includes(node.tagName)) return;
      if (node.classList && node.classList.contains('ce-glossary-term')) return;
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  document.querySelectorAll('.ce-prose').forEach(processNode);

  // Tabs
  document.querySelectorAll('[data-ce-tabs]').forEach((tabs) => {
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ce-tab]');
      if (!btn) return;
      const idx = btn.dataset.ceTab;
      tabs.querySelectorAll('[data-ce-tab]').forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
      tabs.querySelectorAll('[data-ce-panel]').forEach((p) => {
        if (p.dataset.cePanel === idx) p.removeAttribute('hidden');
        else p.setAttribute('hidden', '');
      });
    });
  });
})();
