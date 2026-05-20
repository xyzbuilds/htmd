import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const pr = data.pr || {};
  const files = (data.files || []).map((f, fi) => ({
    file_id: f.id || `f${fi + 1}`,
    path: f.path || `file-${fi + 1}`,
    additions: typeof f.additions === 'number' ? f.additions : 0,
    deletions: typeof f.deletions === 'number' ? f.deletions : 0,
    status: f.status || 'modified',
    comments: (f.comments || []).map((c, ci) => ({
      id: c.id || `c${fi + 1}-${ci + 1}`,
      line: c.line || 0,
      author: c.author || 'agent',
      body: c.body || '',
      resolved: !!c.resolved
    }))
  }));

  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);
  const totalComments = files.reduce((s, f) => s + f.comments.length, 0);

  const initialState = {
    block_id: data.block_id || '',
    title: pr.title || data.title || 'Pull request review',
    prompt_intro: data.prompt_intro || '',
    pr: { title: pr.title || '', author: pr.author || '', base: pr.base || '', head: pr.head || '', number: pr.number || null },
    files: files.map((f) => ({
      file_id: f.file_id,
      path: f.path,
      comments: f.comments.map((c) => ({ id: c.id, line: c.line, body: c.body, resolved: c.resolved }))
    }))
  };

  return html`
    <main class="prr">
      <header class="prr-head">
        <div class="prr-hero">
          <div class="prr-eyebrow">
            <span class="prr-pill">PR${pr.number ? ' #' + pr.number : ''}</span>
            ${pr.base && pr.head ? html`<span class="prr-branch"><code>${pr.head}</code> &rarr; <code>${pr.base}</code></span>` : ''}
          </div>
          <h1 class="prr-title">${pr.title || data.title || 'Pull request review'}</h1>
          <div class="prr-meta">
            ${pr.author ? html`<span class="prr-author">by ${pr.author}</span>` : ''}
            <span class="prr-stats">
              <span class="prr-add">+${totalAdd}</span>
              <span class="prr-del">&minus;${totalDel}</span>
              <span class="prr-fc">${files.length} ${files.length === 1 ? 'file' : 'files'}</span>
              <span class="prr-cm">${totalComments} ${totalComments === 1 ? 'comment' : 'comments'}</span>
            </span>
          </div>
        </div>
      </header>

      <ul class="prr-files">
        ${files.map((f) => fileBlock(f))}
      </ul>

      <button type="button" class="prr-fab" data-prr-copy aria-label="Send review back to agent">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send review back</span>
        <span class="prr-fab-badge" data-prr-count>0</span>
      </button>

      <div class="prr-modal" data-prr-modal hidden role="dialog" aria-modal="true">
        <div class="prr-backdrop" data-prr-close></div>
        <div class="prr-panel">
          <header><h2>Review summary</h2><button type="button" class="prr-x" data-prr-close aria-label="Close">&#x2715;</button></header>
          <pre class="prr-pre" data-prr-text></pre>
          <footer>
            <button type="button" class="prr-btn prr-btn-ghost" data-prr-close>Cancel</button>
            <button type="button" class="prr-btn prr-btn-primary" data-prr-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="prr-toast" data-prr-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-prr-state data-htmd-state="pr-review">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function fileBlock(f) {
  const unresolved = f.comments.filter((c) => !c.resolved).length;
  return html`
    <li class="prr-file" data-prr-file="${f.file_id}">
      <header class="prr-file-head">
        <div class="prr-file-path">
          <span class="prr-status prr-status-${f.status}">${f.status[0].toUpperCase()}</span>
          <code>${f.path}</code>
        </div>
        <div class="prr-file-meta">
          <span class="prr-add">+${f.additions}</span>
          <span class="prr-del">&minus;${f.deletions}</span>
          ${f.comments.length ? html`<span class="prr-cm" data-prr-file-count="${f.file_id}">${unresolved} unresolved</span>` : ''}
        </div>
      </header>
      ${f.comments.length ? html`
        <ul class="prr-comments">
          ${f.comments.map((c) => commentRow(c, f.file_id))}
        </ul>
      ` : html`<p class="prr-empty">No comments on this file.</p>`}
    </li>
  `;
}

function commentRow(c, fileId) {
  return html`
    <li class="prr-comment ${c.resolved ? 'prr-resolved' : ''}" data-prr-comment="${c.id}">
      <div class="prr-comment-head">
        <span class="prr-line">Line ${c.line}</span>
        <span class="prr-author2">${c.author}</span>
        <button type="button" class="prr-resolve" data-prr-resolve="${c.id}" data-prr-file-id="${fileId}" aria-pressed="${c.resolved ? 'true' : 'false'}">
          ${c.resolved ? 'Resolved' : 'Mark resolved'}
        </button>
      </div>
      <p class="prr-comment-body">${c.body}</p>
    </li>
  `;
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
