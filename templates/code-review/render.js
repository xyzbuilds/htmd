import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const files = (data.files || []).map((f, fi) => ({
    path: f.path || `file-${fi + 1}`,
    language: f.language || '',
    lines: parseLines(f.code || '', f.start_line || 1, f.comments || []),
    diff: !!f.diff,
    raw: f.code || '',
    file_id: f.id || `f${fi + 1}`
  }));

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Code review',
    prompt_intro: data.prompt_intro || '',
    files: files.map((f) => ({
      file_id: f.file_id,
      path: f.path,
      preset_comments: f.lines.flatMap((l) => l.comments).map((c) => ({ ...c, original: true })),
      user_comments: []
    }))
  };

  return html`
    <main class="cr">
      <header class="cr-head">
        <h1 class="cr-title">${data.title || 'Code review'}</h1>
        ${data.subtitle ? html`<p class="cr-subtitle">${data.subtitle}</p>` : ''}
        <p class="cr-hint">Click any line number to add an inline comment. The Send button at the bottom-right copies all comments back as a prompt.</p>
      </header>

      ${files.map((f) => fileBlock(f))}

      <button type="button" class="cr-fab" data-cr-copy aria-label="Send comments back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send review comments back</span>
        <span class="cr-fab-badge" data-cr-count>0</span>
      </button>

      <div class="cr-modal" data-cr-modal hidden role="dialog" aria-modal="true">
        <div class="cr-backdrop" data-cr-close></div>
        <div class="cr-panel">
          <header><h2>Review comments</h2><button type="button" class="cr-x" data-cr-close aria-label="Close">&#x2715;</button></header>
          <pre class="cr-pre" data-cr-text></pre>
          <footer>
            <button type="button" class="cr-btn cr-btn-ghost" data-cr-close>Cancel</button>
            <button type="button" class="cr-btn cr-btn-primary" data-cr-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="cr-toast" data-cr-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-cr-state data-htmd-state="code-review">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function fileBlock(f) {
  return html`
    <section class="cr-file" data-cr-file="${f.file_id}">
      <header class="cr-file-head">
        <code>${f.path}</code>
        ${f.language ? html`<span class="cr-lang">${f.language}</span>` : ''}
      </header>
      <div class="cr-code">
        ${f.lines.map((l) => lineRow(l, f.file_id))}
      </div>
    </section>
  `;
}

function lineRow(l, fileId) {
  const cls = ['cr-row'];
  if (l.kind === 'add') cls.push('cr-add');
  if (l.kind === 'del') cls.push('cr-del');
  return html`
    <div class="${cls.join(' ')}" data-cr-line="${l.n}">
      <button type="button" class="cr-linenum" data-cr-add-comment="${fileId}:${l.n}" aria-label="Comment on line ${l.n}">${l.n}</button>
      <code class="cr-text">${l.text === '' ? ' ' : l.text}</code>
      ${l.comments.length ? html`
        <ul class="cr-comments">
          ${l.comments.map((c) => html`<li class="cr-comment cr-comment-preset">${c.body}</li>`)}
        </ul>
      ` : ''}
      <ul class="cr-user-comments" data-cr-user-comments="${fileId}:${l.n}"></ul>
    </div>
  `;
}

function parseLines(code, startLine, comments) {
  const byLine = new Map();
  for (const c of comments) {
    const arr = byLine.get(c.line) || [];
    arr.push({ body: c.body, author: c.author || 'agent' });
    byLine.set(c.line, arr);
  }
  const out = [];
  const rawLines = code.split('\n');
  let n = startLine;
  for (const raw of rawLines) {
    let kind = 'ctx';
    let text = raw;
    if (raw.startsWith('+ ')) { kind = 'add'; text = raw.slice(2); }
    else if (raw.startsWith('- ')) { kind = 'del'; text = raw.slice(2); }
    out.push({ n, text, kind, comments: byLine.get(n) || [] });
    n++;
  }
  return out;
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
