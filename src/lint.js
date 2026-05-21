// src/lint.js — validate htmd fences in a Markdown file before render time.
//
// Rules enforced:
//   - htmd:<template> fences reference a known template
//   - Fenced YAML/JSON parses cleanly
//   - Parsed data conforms to the template's schema (when one exists)
//   - htmd-meta blocks parse (recognized directives, valid value types)
//   - Every opening ``` has a matching close
//   - htmd fences are not nested inside other htmd fences
//
// Reuses the same parsers as compose / normalize so lint behaviour is
// definitionally aligned with render behaviour.

import YAML from 'yaml';
import { listTemplates, loadTemplate } from './templates.js';
import { validate as schemaValidate } from './schema.js';

const FENCE_OPEN_RE = /^(\s{0,3})(`{3,}|~{3,})([^\n]*)$/;
const HTMD_LANG_RE = /^htmd[:\s]+([a-zA-Z0-9_-]+)\s*(.*)$/;
const HTMD_META_RE = /^htmd-meta\s*$/;

// Routing directives understood by src/route.js; type-checked here so a
// `needs-approval: maybe` slips out at lint time, not at run time.
const ROUTING_DIRECTIVE_TYPES = {
  'needs-approval': 'boolean',
  'inline-only': 'boolean',
  'prefer-page': 'boolean',
  'prefer-inline': 'boolean'
};

// Annotation directives commonly seen but not routing-load-bearing. Listed
// only for the unknown-directive warning's allow-list.
const ANNOTATION_DIRECTIVES = new Set([
  'priority',
  'estimated-minutes',
  'assign-to',
  'tag',
  'tags'
]);

/**
 * Lint a Markdown string for htmd-fence issues.
 *
 * @param {string} md
 * @param {{ filePath?: string|null }} opts
 * @returns {Promise<{ errors: LintIssue[], warnings: LintIssue[] }>}
 */
export async function lintMarkdown(md, opts = {}) {
  const filePath = opts.filePath ?? null;
  const errors = [];
  const warnings = [];

  if (md == null) {
    return { errors, warnings };
  }

  const fences = scanFences(String(md));
  const known = await listTemplates();
  const templateNames = new Set(known.map((t) => t.name));

  for (const f of fences) {
    const info = f.info.trim();

    if (HTMD_META_RE.test(info)) {
      if (!f.closed) {
        errors.push(loc(filePath, f.line, f.col, 'unclosed-fence',
          'Unclosed htmd-meta fence (no matching \`\`\` close)'));
        continue;
      }
      checkMetaBody(f, errors, warnings, filePath);
      continue;
    }

    const m = HTMD_LANG_RE.exec(info);
    if (!m) continue; // Not an htmd fence — leave plain code blocks alone.
    const templateName = m[1];

    if (!f.closed) {
      errors.push(loc(filePath, f.line, f.col, 'unclosed-fence',
        `Unclosed htmd:${templateName} fence (no matching \`\`\` close)`));
      continue;
    }

    const nested = findNestedHtmdLines(f.body);
    for (const n of nested) {
      const absLine = f.bodyStartLine + n.line - 1;
      errors.push(loc(filePath, absLine, n.col, 'nested-htmd',
        `Nested htmd fence inside htmd:${templateName} fence body. htmd fences cannot be nested.`));
    }
    if (nested.length) continue; // Don't double-report on the nested body.

    if (!templateNames.has(templateName)) {
      const list = [...templateNames].sort().slice(0, 8).join(', ');
      errors.push(loc(filePath, f.line, f.col, 'unknown-template',
        `Unknown template "${templateName}". Run \`htmd templates\` to list. (e.g.: ${list}…)`));
      continue;
    }

    let data;
    try {
      data = parseFenceBody(f.body);
    } catch (e) {
      errors.push(loc(filePath, f.bodyStartLine, 1, 'parse-error',
        `htmd:${templateName} body is not valid YAML/JSON: ${e.message}`));
      continue;
    }

    let template;
    try {
      template = await loadTemplate(templateName);
    } catch (e) {
      // Defensive: listTemplates said it existed but loadTemplate failed.
      errors.push(loc(filePath, f.line, f.col, 'unknown-template', e.message));
      continue;
    }

    if (template.schema) {
      const result = schemaValidate(template.schema, data);
      if (!result.ok) {
        for (const se of result.errors) {
          const where = se.path === '(root)' ? '' : ` at ${se.path}`;
          errors.push(loc(filePath, f.bodyStartLine, 1, 'schema-error',
            `htmd:${templateName} data${where}: ${se.message}`));
        }
      }
    }
  }

  return { errors, warnings };
}

function loc(file, line, col, rule, message) {
  return { file, line, col, rule, message };
}

function checkMetaBody(f, errors, warnings, filePath) {
  const lines = f.body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const absLine = f.bodyStartLine + i;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) {
      // Bare directive — only legal if the key shape is valid.
      if (!isValidMetaKey(line)) {
        errors.push(loc(filePath, absLine, 1, 'meta-bad-syntax',
          `htmd-meta line is not "key" or "key: value": "${raw}"`));
        continue;
      }
      if (!isKnownMetaKey(line)) {
        warnings.push(loc(filePath, absLine, 1, 'meta-unknown-directive',
          `Unknown htmd-meta directive "${line}". Passed through verbatim — see docs/PHASE3_DESIGN.md §Agent-side intent metadata.`));
      }
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (!key) {
      errors.push(loc(filePath, absLine, 1, 'meta-empty-key',
        `htmd-meta line has empty key: "${raw}"`));
      continue;
    }
    if (!isValidMetaKey(key)) {
      errors.push(loc(filePath, absLine, 1, 'meta-bad-key',
        `htmd-meta key "${key}" must match [A-Za-z][A-Za-z0-9_-]*`));
      continue;
    }
    if (!isKnownMetaKey(key)) {
      warnings.push(loc(filePath, absLine, 1, 'meta-unknown-directive',
        `Unknown htmd-meta directive "${key}". Passed through verbatim — see docs/PHASE3_DESIGN.md §Agent-side intent metadata.`));
    }
    const expectedType = ROUTING_DIRECTIVE_TYPES[key];
    if (expectedType) {
      const parsed = coerceMetaValue(val);
      if (typeof parsed !== expectedType) {
        errors.push(loc(filePath, absLine, 1, 'meta-bad-value',
          `htmd-meta directive "${key}" expects ${expectedType}; got ${typeof parsed} (${JSON.stringify(parsed)})`));
      }
    }
  }
}

function isValidMetaKey(k) {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(k);
}

function isKnownMetaKey(k) {
  return Object.prototype.hasOwnProperty.call(ROUTING_DIRECTIVE_TYPES, k) ||
    ANNOTATION_DIRECTIVES.has(k);
}

// Mirrors src/normalize.js parseValue so lint sees what the router will see.
function coerceMetaValue(v) {
  if (v === '') return true;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

// Walk lines, find every opening fence at the top level and pair it with
// the matching close (same character, length ≥ open). Nested fences inside
// a fence body are surfaced via findNestedHtmdLines on the body string.
function scanFences(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = FENCE_OPEN_RE.exec(line);
    if (!m) { i++; continue; }
    const indent = m[1].length;
    const marker = m[2];
    const info = m[3];
    const fenceChar = marker[0];
    const fenceLen = marker.length;
    const startLine = i + 1; // 1-based
    const startCol = indent + 1;
    const closeRe = new RegExp(`^\\s{0,3}(${escapeReChar(fenceChar)}{${fenceLen},})\\s*$`);
    let closed = false;
    let j = i + 1;
    while (j < lines.length) {
      if (closeRe.test(lines[j])) { closed = true; break; }
      j++;
    }
    const bodyLines = lines.slice(i + 1, closed ? j : lines.length);
    out.push({
      info,
      marker,
      fenceChar,
      fenceLen,
      line: startLine,
      col: startCol,
      bodyStartLine: i + 2, // 1-based line of first body line
      body: bodyLines.join('\n'),
      closed,
      closeLine: closed ? j + 1 : -1
    });
    i = closed ? j + 1 : lines.length;
  }
  return out;
}

function escapeReChar(c) {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNestedHtmdLines(body) {
  const lines = body.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s{0,3})(?:`{3,}|~{3,})\s*htmd[:\s][a-zA-Z0-9_-]+/.exec(lines[i]);
    if (m) out.push({ line: i + 1, col: m[1].length + 1 });
  }
  return out;
}

// Mirrors src/compose.js parseFenceBody so lint accepts exactly what
// compose will accept at render time.
function parseFenceBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  return YAML.parse(trimmed);
}

/**
 * Format a lint result for stdout. Default human-readable; `format: 'json'`
 * emits a stable machine-readable envelope.
 */
export function formatLintResult(result, opts = {}) {
  const format = opts.format || 'text';
  const fallbackFile = opts.file || '<stdin>';
  if (format === 'json') {
    return JSON.stringify({
      errors: result.errors,
      warnings: result.warnings
    }, null, 2) + '\n';
  }
  const out = [];
  for (const e of result.errors) out.push(formatOne(e, 'error', fallbackFile));
  for (const w of result.warnings) out.push(formatOne(w, 'warning', fallbackFile));
  return out.length ? out.join('\n') + '\n' : '';
}

function formatOne(issue, severity, fallbackFile) {
  const file = issue.file || fallbackFile;
  return `${file}:${issue.line}:${issue.col}: ${severity}[${issue.rule}]: ${issue.message}`;
}

/**
 * @typedef {object} LintIssue
 * @property {string|null} file
 * @property {number} line   1-based line number where the issue starts.
 * @property {number} col    1-based column.
 * @property {string} rule   stable identifier (e.g. "unknown-template").
 * @property {string} message human-readable explanation.
 */
