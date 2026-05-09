(function () {
  const root = document.querySelector('.sd');
  if (!root) return;
  const slides = Array.from(root.querySelectorAll('.sd-slide'));
  const stage = root.querySelector('.sd-stage');
  const overview = root.querySelector('.sd-overview');
  const help = root.querySelector('[data-sd-help-dialog]');
  const closeBtn = root.querySelector('[data-sd-close-help]');
  const cur = root.querySelector('[data-sd-current]');
  const tot = root.querySelector('[data-sd-total]');
  let i = 0;
  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, idx) => {
      if (idx === i) s.setAttribute('data-active', '');
      else s.removeAttribute('data-active');
    });
    if (cur) cur.textContent = i + 1;
    location.hash = String(i + 1);
  }
  function toggleOverview(force) {
    const show = force != null ? force : overview.hasAttribute('hidden');
    if (show) overview.removeAttribute('hidden');
    else overview.setAttribute('hidden', '');
  }
  document.addEventListener('keydown', (e) => {
    if (help.open) {
      if (e.key === 'Escape') help.close();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { show(i + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(i - 1); e.preventDefault(); }
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
    else if (e.key === 'o' || e.key === 'O') toggleOverview();
    else if (e.key === '?') help.showModal();
    else if (e.key === 'Escape') toggleOverview(false);
    else if (e.key === 'p' || e.key === 'P') window.print();
  });
  if (overview) {
    overview.addEventListener('click', (e) => {
      const t = e.target.closest('[data-sd-jump]');
      if (!t) return;
      show(parseInt(t.dataset.sdJump, 10));
      toggleOverview(false);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', () => help.close());
  // Click navigation: left half = prev, right half = next.
  stage.addEventListener('click', (e) => {
    const w = stage.clientWidth;
    if (e.clientX < w / 2) show(i - 1);
    else show(i + 1);
  });
  // Initial slide from hash
  const initial = parseInt(location.hash.replace('#', ''), 10);
  if (!isNaN(initial) && initial > 0) show(initial - 1);
  if (tot) tot.textContent = slides.length;
})();
