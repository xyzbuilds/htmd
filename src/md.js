// Marked wrapper.
import { marked } from 'marked';
import { raw } from './html-tag.js';

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: false,
  mangle: false
});

export function mdToHtml(md, opts = {}) {
  if (md == null) return '';
  return marked.parse(String(md), opts);
}

// For embedding inside templates: returns a `raw()` wrapper.
export function md(input) {
  return raw(mdToHtml(input));
}
