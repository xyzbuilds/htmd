(function () {
  const stateNode = document.querySelector('[data-kb-state]');
  if (!stateNode) return;
  const state = JSON.parse(stateNode.textContent);
  const toast = document.querySelector('[data-kb-toast]');

  function showToast(msg, ms = 1800) {
    if (!toast) return;
    toast.textContent = msg;
    toast.removeAttribute('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.setAttribute('hidden', ''), ms);
  }

  function recountAll() {
    state.columns.forEach((c) => {
      const el = document.querySelector(`[data-kb-count="${c.key}"]`);
      const count = document.querySelectorAll(`[data-kb-drop="${c.key}"] .kb-ticket`).length;
      if (el) el.textContent = count;
    });
  }

  function syncStateFromDOM() {
    state.tickets = [];
    state.columns.forEach((c) => {
      const drop = document.querySelector(`[data-kb-drop="${c.key}"]`);
      if (!drop) return;
      drop.querySelectorAll('.kb-ticket').forEach((t) => {
        const id = t.dataset.kbId;
        const title = t.querySelector('.kb-ticket-title')?.textContent || '';
        const body = t.querySelector('.kb-ticket-body')?.textContent || '';
        const owner = t.querySelector('.kb-owner')?.textContent.replace(/^@/, '') || '';
        const tags = Array.from(t.querySelectorAll('.kb-tag')).map((x) => x.textContent);
        state.tickets.push({ id, title, body, owner, tags, column: c.key });
      });
    });
    persistHash();
  }

  function persistHash() {
    const minimal = state.tickets.map((t) => `${t.id}:${t.column}`).join(',');
    location.hash = encodeURIComponent(minimal);
  }

  function applyHash() {
    if (!location.hash) return;
    const map = {};
    decodeURIComponent(location.hash.slice(1)).split(',').forEach((p) => {
      const [id, col] = p.split(':');
      if (id && col) map[id] = col;
    });
    Object.entries(map).forEach(([id, col]) => {
      const t = document.querySelector(`[data-kb-id="${id}"]`);
      const drop = document.querySelector(`[data-kb-drop="${col}"]`);
      if (t && drop && t.parentNode !== drop) drop.appendChild(t);
    });
  }

  // Drag-drop
  let dragId = null;
  document.querySelectorAll('.kb-ticket').forEach((t) => {
    t.addEventListener('dragstart', (e) => {
      dragId = t.dataset.kbId;
      t.classList.add('kb-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    t.addEventListener('dragend', () => {
      t.classList.remove('kb-dragging');
      dragId = null;
    });
  });
  document.querySelectorAll('[data-kb-drop]').forEach((drop) => {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('kb-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('kb-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('kb-over');
      const id = e.dataTransfer.getData('text/plain') || dragId;
      const t = document.querySelector(`[data-kb-id="${id}"]`);
      if (!t) return;
      drop.appendChild(t);
      syncStateFromDOM();
      recountAll();
    });
  });

  // Export Markdown
  document.querySelector('[data-kb-export]')?.addEventListener('click', async () => {
    syncStateFromDOM();
    const lines = [];
    state.columns.forEach((c) => {
      lines.push(`## ${c.name}`);
      lines.push('');
      const items = state.tickets.filter((t) => t.column === c.key);
      if (items.length === 0) lines.push('_(none)_');
      items.forEach((t) => {
        const tags = (t.tags || []).map((x) => `\`${x}\``).join(' ');
        const owner = t.owner ? ` — @${t.owner}` : '';
        lines.push(`- **[${t.id}]** ${t.title}${owner}${tags ? ' ' + tags : ''}`);
        if (t.body) lines.push(`  ${t.body}`);
      });
      lines.push('');
    });
    const md = lines.join('\n');
    try {
      await navigator.clipboard.writeText(md);
      showToast('Markdown copied to clipboard');
    } catch {
      showToast('Could not copy — see console');
      console.log(md);
    }
  });

  document.querySelector('[data-kb-share]')?.addEventListener('click', async () => {
    persistHash();
    try {
      await navigator.clipboard.writeText(location.href);
      showToast('Shareable URL copied');
    } catch {
      showToast(location.href);
    }
  });

  applyHash();
  recountAll();
})();
