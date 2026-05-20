import { html, raw, escapeHtml } from '../../src/html-tag.js';

export default function render(data, h) {
  const files = (data.files || []).map((f, fi) => ({
    file_id: f.id || `f${fi + 1}`,
    path: f.path || `file-${fi + 1}`,
    language: (f.language || '').toLowerCase(),
    before: String(f.before == null ? '' : f.before),
    after: String(f.after == null ? '' : f.after),
    mode: (f.mode || data.mode || 'unified').toLowerCase()
  }));
  const allowAR = data.allow_accept_reject !== false;

  const initialState = {
    block_id: data.block_id || '',
    title: data.title || 'Code diff',
    prompt_intro: data.prompt_intro || '',
    files: files.map((f) => ({ file_id: f.file_id, path: f.path, hunks: [] }))
  };

  return html`
    <main class="cdf">
      <header class="cdf-head">
        <h1 class="cdf-title">${data.title || 'Code diff'}</h1>
        ${data.subtitle ? html`<p class="cdf-subtitle">${data.subtitle}</p>` : ''}
        <p class="cdf-hint">${allowAR ? 'Accept or reject each hunk. The Send button copies the decision summary back as a prompt.' : 'Read-only diff view.'}</p>
      </header>

      ${files.map((f) => fileBlock(f, allowAR))}

      ${allowAR ? html`
        <button type="button" class="cdf-fab" data-cdf-copy aria-label="Send hunk decisions back to agent">
          <span aria-hidden="true">&#x21B5;</span>
          <span>Send decisions back</span>
          <span class="cdf-fab-badge" data-cdf-count>0</span>
        </button>

        <div class="cdf-modal" data-cdf-modal hidden role="dialog" aria-modal="true">
          <div class="cdf-backdrop" data-cdf-close></div>
          <div class="cdf-panel">
            <header><h2>Decisions</h2><button type="button" class="cdf-x" data-cdf-close aria-label="Close">&#x2715;</button></header>
            <pre class="cdf-pre" data-cdf-text></pre>
            <footer>
              <button type="button" class="cdf-btn cdf-btn-ghost" data-cdf-close>Cancel</button>
              <button type="button" class="cdf-btn cdf-btn-primary" data-cdf-confirm>Copy</button>
            </footer>
          </div>
        </div>
        <div class="cdf-toast" data-cdf-toast hidden role="status" aria-live="polite"></div>
      ` : ''}

      <script type="application/json" data-cdf-state data-htmd-state="code-diff">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function fileBlock(f, allowAR) {
  const hunks = diffToHunks(f.before, f.after);
  const additions = hunks.reduce((s, hk) => s + hk.lines.filter((l) => l.kind === 'add').length, 0);
  const deletions = hunks.reduce((s, hk) => s + hk.lines.filter((l) => l.kind === 'del').length, 0);

  return html`
    <section class="cdf-file" data-cdf-file="${f.file_id}">
      <header class="cdf-file-head">
        <code class="cdf-path">${f.path}</code>
        <div class="cdf-meta">
          ${f.language ? html`<span class="cdf-lang">${f.language}</span>` : ''}
          <span class="cdf-add">+${additions}</span>
          <span class="cdf-del">&minus;${deletions}</span>
        </div>
      </header>
      <div class="cdf-body">
        ${hunks.map((hunk, hi) => hunkBlock(f, hunk, hi, allowAR))}
      </div>
    </section>
  `;
}

function hunkBlock(f, hunk, hi, allowAR) {
  const hid = `${f.file_id}:h${hi}`;
  return html`
    <div class="cdf-hunk" data-cdf-hunk="${hid}">
      ${allowAR ? html`
        <div class="cdf-hunk-actions" role="group" aria-label="Hunk decision">
          <button type="button" class="cdf-hb cdf-hb-accept" data-cdf-decide="accept" data-cdf-target="${hid}" aria-pressed="false">Accept</button>
          <button type="button" class="cdf-hb cdf-hb-reject" data-cdf-decide="reject" data-cdf-target="${hid}" aria-pressed="false">Reject</button>
          <span class="cdf-hunk-status" data-cdf-status="${hid}"></span>
        </div>
      ` : ''}
      <div class="cdf-lines">
        ${hunk.lines.map((l) => lineRow(l, f.language))}
      </div>
    </div>
  `;
}

function lineRow(l, lang) {
  const k = l.kind;
  const symbol = k === 'add' ? '+' : k === 'del' ? '-' : ' ';
  const tok = tokenize(l.text, lang);
  return html`
    <div class="cdf-row cdf-${k}">
      <span class="cdf-gutter cdf-gutter-old">${l.bn ? String(l.bn) : ''}</span>
      <span class="cdf-gutter cdf-gutter-new">${l.an ? String(l.an) : ''}</span>
      <span class="cdf-sign">${symbol}</span>
      <code class="cdf-text">${tok}</code>
    </div>
  `;
}

function diffToHunks(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length === 1 && a[0] === '') a.length = 0;
  if (b.length === 1 && b[0] === '') b.length = 0;
  const diff = lcsDiff(a, b);
  let bN = 1, aN = 1;
  for (const d of diff) {
    if (d.kind === 'ctx') { d.bn = bN++; d.an = aN++; }
    else if (d.kind === 'del') { d.bn = bN++; }
    else { d.an = aN++; }
  }
  const ctxLines = 2;
  const hunks = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].kind === 'ctx') { i++; continue; }
    let s = i;
    while (s > 0 && diff[s - 1].kind === 'ctx' && (i - s) < ctxLines) s--;
    while (i < diff.length && diff[i].kind !== 'ctx') i++;
    let e = i;
    let trailing = 0;
    while (e < diff.length && diff[e].kind === 'ctx' && trailing < ctxLines) { e++; trailing++; }
    hunks.push({ lines: diff.slice(s, e) });
    i = e;
  }
  if (hunks.length === 0 && diff.length > 0) hunks.push({ lines: diff });
  return hunks;
}

function lcsDiff(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ kind: 'ctx', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i++; }
    else { out.push({ kind: 'add', text: b[j] }); j++; }
  }
  while (i < m) out.push({ kind: 'del', text: a[i++] });
  while (j < n) out.push({ kind: 'add', text: b[j++] });
  return out;
}

const JS_KW = /\b(?:abstract|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|get|if|import|in|instanceof|let|new|null|of|return|set|static|super|switch|this|throw|true|false|try|type|typeof|undefined|var|void|while|with|yield)\b/g;
const PY_KW = /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b/g;
const KW_BY_LANG = {
  js: JS_KW, javascript: JS_KW, ts: JS_KW, typescript: JS_KW, jsx: JS_KW, tsx: JS_KW,
  py: PY_KW, python: PY_KW
};

function tokenize(text, lang) {
  if (text === '') return raw('&nbsp;');
  if (!lang || !KW_BY_LANG[lang]) return text;
  let s = escapeHtml(text);
  s = s.replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="cdf-tok-cmt">$1</span>');
  s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="cdf-tok-str">$1</span>');
  s = s.replace(KW_BY_LANG[lang], '<span class="cdf-tok-kw">$&</span>');
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="cdf-tok-num">$1</span>');
  return raw(s);
}

function safeJson(obj) { return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1'); }
