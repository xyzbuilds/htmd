import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const cols = data.columns || [];
  const tickets = data.tickets || [];
  const initial = { title: data.title || 'Kanban', columns: cols, tickets };
  return html`
    <main class="kb">
      <header class="kb-head">
        <div>
          <h1 class="kb-title">${data.title || 'Kanban'}</h1>
          ${data.subtitle ? html`<p class="kb-subtitle">${data.subtitle}</p>` : ''}
        </div>
        <div class="kb-tools">
          <button type="button" data-kb-export>Export Markdown</button>
          <button type="button" data-kb-share>Share view</button>
        </div>
      </header>
      <div class="kb-board">
        ${cols.map((c) => html`
          <section class="kb-col" data-kb-col="${c.key}">
            <header class="kb-col-head">
              <h2>${c.name}</h2>
              <span class="kb-col-count" data-kb-count="${c.key}">0</span>
            </header>
            <div class="kb-col-body" data-kb-drop="${c.key}">
              ${tickets.filter((t) => t.column === c.key).map((t) => ticket(t))}
            </div>
          </section>
        `)}
      </div>
      <div class="kb-toast" data-kb-toast hidden></div>
      <script type="application/json" data-kb-state data-htmd-state="kanban-board">${h.raw(safeJson(initial))}</script>
    </main>
  `;
}

function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}

function ticket(t) {
  return html`
    <article class="kb-ticket" draggable="true" data-kb-id="${t.id}">
      <div class="kb-ticket-id">${t.id}</div>
      <div class="kb-ticket-title">${t.title}</div>
      ${t.body ? html`<p class="kb-ticket-body">${t.body}</p>` : ''}
      <footer class="kb-ticket-foot">
        ${(t.tags || []).map((tg) => html`<span class="kb-tag">${tg}</span>`)}
        ${t.owner ? html`<span class="kb-owner">@${t.owner}</span>` : ''}
      </footer>
    </article>
  `;
}
