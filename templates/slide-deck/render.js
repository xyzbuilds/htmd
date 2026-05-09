import { html, raw } from '../../src/html-tag.js';

export default function render(data, h) {
  const slides = data.slides || [];
  return html`
    <main class="sd" data-theme="${data.theme || 'default'}">
      <header class="sd-toolbar" aria-hidden="true">
        <span class="sd-title">${data.title || 'Slides'}</span>
        <span class="sd-counter"><span data-sd-current>1</span> / <span data-sd-total>${slides.length}</span></span>
        <span class="sd-help">← →  to navigate · <kbd>?</kbd> help · <kbd>o</kbd> overview</span>
      </header>
      <div class="sd-stage" tabindex="0">
        ${slides.map((s, i) => slide(s, i, h))}
      </div>
      <div class="sd-overview" hidden>
        ${slides.map((s, i) => html`
          <button class="sd-thumb" data-sd-jump="${i}">
            <span class="sd-thumb-num">${i + 1}</span>
            <span class="sd-thumb-title">${s.title || `Slide ${i + 1}`}</span>
          </button>
        `)}
      </div>
      <dialog class="sd-dialog" data-sd-help-dialog>
        <h2>Keyboard shortcuts</h2>
        <ul>
          <li><kbd>←</kbd> / <kbd>→</kbd> previous / next slide</li>
          <li><kbd>Home</kbd> / <kbd>End</kbd> jump to first / last</li>
          <li><kbd>o</kbd> toggle overview</li>
          <li><kbd>?</kbd> this help</li>
          <li><kbd>Esc</kbd> exit overview / close help</li>
          <li><kbd>p</kbd> print (one slide per page)</li>
        </ul>
        <button data-sd-close-help>Close</button>
      </dialog>
    </main>
  `;
}

function slide(s, idx, h) {
  return html`
    <section class="sd-slide" data-sd-slide="${idx}" ${idx === 0 ? raw('data-active') : ''}>
      <div class="sd-slide-inner">
        ${s.title ? html`<h2 class="sd-slide-title">${s.title}</h2>` : ''}
        ${s.image ? html`<img class="sd-slide-image" src="${s.image}" alt="">` : ''}
        ${s.body_md ? html`<div class="sd-slide-body">${h.md(s.body_md)}</div>` : ''}
        ${s.code ? html`<pre class="sd-slide-code"><code>${s.code}</code></pre>` : ''}
      </div>
      ${s.notes ? html`<aside class="sd-notes" hidden>${s.notes}</aside>` : ''}
    </section>
  `;
}
