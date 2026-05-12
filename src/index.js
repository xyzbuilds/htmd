// Public package entry — re-exports the high-level API.
export { renderTemplate, renderTemplateParts, renderMarkdown, wrapShell } from './render.js';
export { composeFromMarkdown, parseSegments } from './compose.js';
export { detectTemplates } from './detect.js';
export { extractState } from './extract.js';
export { listTemplates, loadTemplate, templateRoot, projectRoot } from './templates.js';
export { compile, validate, formatErrorList } from './schema.js';
export { html, raw, safe, escapeHtml, toString, cls } from './html-tag.js';
export { md, mdToHtml } from './md.js';
export { htmlToMd } from './html2md.js';
export * as chart from './chart.js';
