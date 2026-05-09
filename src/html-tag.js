// Tagged template literal helper with auto-escaping.
// Usage:
//   import { html, raw, safe } from './html-tag.js';
//   html`<div>${userInput}</div>`            // userInput is escaped
//   html`<div>${raw(trustedHtml)}</div>`     // trustedHtml is NOT escaped
//   html`${arr.map(x => html`<li>${x}</li>`)}` // nested templates flatten

const RAW = Symbol('htmd.raw');

export function raw(value) {
  if (value == null) return { [RAW]: true, value: '' };
  if (typeof value === 'object' && value[RAW]) return value;
  return { [RAW]: true, value: String(value) };
}

// Alias for clarity in templates
export const safe = raw;

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"'`]/g, (c) => ESCAPE_MAP[c]);
}

function serialize(value) {
  if (value == null || value === false) return '';
  if (value === true) return 'true';
  if (typeof value === 'object' && value[RAW]) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  if (typeof value === 'object' && value !== null && 'raw' in value && Array.isArray(value.raw)) {
    // Already an html-tag result (object with .raw is unusual; treat as string)
    return escapeHtml(String(value));
  }
  return escapeHtml(String(value));
}

export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) out += serialize(values[i]);
  }
  return raw(out);
}

// Convert an html() result back to a plain string for output.
export function toString(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value[RAW]) return value.value;
  return String(value);
}

// Helper: classnames-style joiner
export function cls(...args) {
  const out = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === 'string') out.push(a);
    else if (Array.isArray(a)) out.push(cls(...a));
    else if (typeof a === 'object') {
      for (const [k, v] of Object.entries(a)) if (v) out.push(k);
    }
  }
  return out.join(' ');
}
