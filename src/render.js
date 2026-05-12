// Render orchestrator: template + data → self-contained HTML.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTemplate, projectRoot } from './templates.js';
import { validate, formatErrorList } from './schema.js';
import { html, raw, toString, escapeHtml } from './html-tag.js';
import { md, mdToHtml } from './md.js';
import * as chart from './chart.js';

const ROOT = projectRoot();
const TOKENS_CSS = readFileSync(join(ROOT, 'templates/_base/tokens.css'), 'utf8');
const RESET_CSS = readFileSync(join(ROOT, 'templates/_base/reset.css'), 'utf8');

const helpers = {
  html,
  raw,
  escapeHtml,
  md,
  mdToHtml,
  chart,
  fmt: {
    number(v, opts = {}) {
      if (typeof v !== 'number' || !isFinite(v)) return String(v ?? '');
      return new Intl.NumberFormat('en-US', opts).format(v);
    },
    currency(v, code = 'USD') {
      if (typeof v !== 'number' || !isFinite(v)) return String(v ?? '');
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(v);
    },
    percent(v, digits = 1) {
      if (typeof v !== 'number' || !isFinite(v)) return String(v ?? '');
      return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    },
    delta(v, digits = 1) {
      if (typeof v !== 'number' || !isFinite(v)) return '';
      const sign = v > 0 ? '+' : '';
      return sign + v.toFixed(digits) + '%';
    },
    date(v) {
      if (!v) return '';
      try {
        const d = new Date(v);
        if (isNaN(d.getTime())) return String(v);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return String(v);
      }
    }
  }
};

// Render template body + collect its CSS/JS without wrapping in a full HTML doc.
// Used by compose to interleave multiple template instances into one page.
export async function renderTemplateParts(name, data, opts = {}) {
  const tpl = await loadTemplate(name);
  if (tpl.schema && opts.validate !== false) {
    const result = validate(tpl.schema, data);
    if (!result.ok) {
      const err = new Error(
        `Schema validation failed for template "${name}":\n${formatErrorList(result.errors)}`
      );
      err.errors = result.errors;
      err.code = 'HTMD_SCHEMA_INVALID';
      throw err;
    }
  }
  const body = tpl.render(data, helpers);
  return {
    name,
    title: opts.title || data?.title || name,
    body: toString(body),
    css: tpl.css || '',
    js: tpl.js || ''
  };
}

export async function renderTemplate(name, data, opts = {}) {
  const parts = await renderTemplateParts(name, data, opts);
  return wrapShell({
    title: parts.title,
    body: parts.body,
    css: parts.css,
    js: parts.js,
    template: name,
    lang: opts.lang || 'en'
  });
}

export function wrapShell({ title, body, css, js, template, lang, headExtra }) {
  const safeTitle = escapeHtml(title || 'htmd');
  const tplAttr = template ? ` data-htmd-template="${escapeHtml(template)}"` : '';
  const styles = `${RESET_CSS}\n${TOKENS_CSS}\n${css || ''}`;
  const scriptTag = js ? `\n<script>\n${js}\n</script>` : '';
  const extra = headExtra ? `\n${headExtra}` : '';
  return `<!doctype html>
<html lang="${escapeHtml(lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="htmd v0.4.0">
<title>${safeTitle}</title>
<style>
${styles}
</style>${extra}
</head>
<body${tplAttr}>
${body}${scriptTag}
</body>
</html>
`;
}

// Plain markdown → styled HTML (no template, default theme)
export function renderMarkdown(mdText, opts = {}) {
  const body = mdToHtml(mdText);
  const css = `
.htmd-md { max-width: 760px; margin: 2rem auto; padding: 0 1.25rem; }
.htmd-md > :first-child { margin-top: 0; }
.htmd-md h1, .htmd-md h2, .htmd-md h3 { letter-spacing: -0.01em; }
.htmd-md h1 { font-size: 2rem; margin-top: 2rem; }
.htmd-md h2 { font-size: 1.5rem; margin-top: 2rem; }
.htmd-md h3 { font-size: 1.2rem; margin-top: 1.5rem; }
.htmd-md p, .htmd-md ul, .htmd-md ol { line-height: 1.65; }
.htmd-md pre { background: var(--htmd-surface-2); padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.9em; }
.htmd-md code { background: var(--htmd-surface-2); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; }
.htmd-md pre code { background: none; padding: 0; }
.htmd-md blockquote { border-left: 3px solid var(--htmd-accent); margin: 1rem 0; padding: 0.25rem 1rem; color: var(--htmd-fg-muted); }
.htmd-md table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
.htmd-md th, .htmd-md td { border: 1px solid var(--htmd-border); padding: 0.5rem 0.75rem; text-align: left; }
.htmd-md th { background: var(--htmd-surface-2); }
.htmd-md hr { border: none; border-top: 1px solid var(--htmd-border); margin: 2rem 0; }
`;
  return wrapShell({
    title: opts.title || 'Markdown',
    body: `<article class="htmd-md">${body}</article>`,
    css,
    js: '',
    template: 'markdown',
    lang: opts.lang
  });
}
