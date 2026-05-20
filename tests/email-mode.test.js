import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { renderTemplate } from '../src/render.js';
import { inlineEmailCss, parseHtml, serializeHtml } from '../src/email-inliner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REPRESENTATIVE = [
  'status-report',  // hero gradient, metrics grid, sections
  'dashboard',      // inline SVG charts (var() in attributes)
  'kanban-board',   // interactive (scripts must be stripped)
  'data-table',     // dense tabular layout
  'feedback-corrector', // interactive + label emojis (user data)
  'email-digest',   // canonically email-shaped already
  'pr-review'       // nested DOM, descendant selectors
];

function loadExample(name) {
  return YAML.parse(readFileSync(join(ROOT, 'templates', name, 'example.yaml'), 'utf8'));
}

function findElement(node, tagName) {
  if (node.type === 'element' && node.name === tagName) return node;
  if (!node.children) return null;
  for (const c of node.children) {
    const found = findElement(c, tagName);
    if (found) return found;
  }
  return null;
}

describe('email mode: invariants per template', () => {
  for (const t of REPRESENTATIVE) {
    it(`${t} produces email-safe HTML`, async () => {
      const data = loadExample(t);
      const html = await renderTemplate(t, data, { mode: 'email' });
      // No script tags (including inline JSON state blobs).
      expect(html).not.toMatch(/<script[\s>]/i);
      // No external stylesheet links.
      expect(html).not.toMatch(/<link[^>]*rel\s*=\s*["']?stylesheet/i);
      // No remaining <style> block (post-inlining).
      expect(html).not.toMatch(/<style[\s>]/i);
      // No raw var(--…) references anywhere — inline attrs OR style.
      expect(html.includes('var(--')).toBe(false);
      // Still re-parses cleanly.
      const tree = parseHtml(html);
      expect(tree.type).toBe('root');
      // <body> element exists with the template marker.
      const body = findElement(tree, 'body');
      expect(body).not.toBeNull();
      expect(body.attrs['data-htmd-template']).toBe(t);
      // Body carries inlined styles (font-family, background) from the
      // tokens.css body rule.
      expect(body.attrs.style || '').toMatch(/font-family/);
    });
  }
});

describe('email mode: comparison to web mode', () => {
  it('web mode is unchanged when --mode flag is omitted', async () => {
    const data = loadExample('status-report');
    const a = await renderTemplate('status-report', data);
    const b = await renderTemplate('status-report', data, { mode: 'web' });
    expect(a).toBe(b);
  });

  it('email mode strips the wrapper script tag', async () => {
    const data = loadExample('kanban-board');
    const webHtml = await renderTemplate('kanban-board', data);
    const emailHtml = await renderTemplate('kanban-board', data, { mode: 'email' });
    expect(webHtml).toMatch(/<script>/);
    expect(emailHtml).not.toMatch(/<script[\s>]/i);
  });

  it('unknown mode throws', async () => {
    const data = loadExample('status-report');
    await expect(renderTemplate('status-report', data, { mode: 'banana' }))
      .rejects.toThrow(/unknown render mode/i);
  });
});

describe('email mode: determinism / snapshot', () => {
  it('status-report email render is byte-stable across runs', async () => {
    const data = loadExample('status-report');
    const a = await renderTemplate('status-report', data, { mode: 'email' });
    const b = await renderTemplate('status-report', data, { mode: 'email' });
    expect(a).toBe(b);
    // Stable across a fresh import (re-render from the same input).
    const c = await renderTemplate('status-report', data, { mode: 'email' });
    expect(a).toBe(c);
  });

  it('status-report email render preserves the document title', async () => {
    const data = loadExample('status-report');
    const html = await renderTemplate('status-report', data, { mode: 'email' });
    expect(html).toMatch(/<title>htmd v0\.1 ship week<\/title>/);
  });
});

describe('email-inliner: low-level units', () => {
  it('resolves var(--foo) against :root with fallback chain', () => {
    const html = `<!doctype html><html><head><style>
      :root { --a: #abc; --b: var(--a); --c: var(--missing, var(--b)); }
      .x { color: var(--c); }
    </style></head><body><p class="x">hi</p></body></html>`;
    const out = inlineEmailCss(html);
    expect(out).toMatch(/color:\s*#abc/);
    expect(out.includes('var(--')).toBe(false);
  });

  it('skips @media blocks entirely (dark mode + responsive)', () => {
    const html = `<!doctype html><html><head><style>
      :root { --bg: white; }
      body { background: var(--bg); }
      @media (prefers-color-scheme: dark) { :root { --bg: black; } }
      @media (max-width: 720px) { body { background: red; } }
    </style></head><body>x</body></html>`;
    const out = inlineEmailCss(html);
    expect(out).toMatch(/background:\s*white/);
    expect(out).not.toMatch(/background:\s*(black|red)/);
  });

  it('drops rules with unsupported selectors (:hover, ::before, *::after)', () => {
    const html = `<!doctype html><html><head><style>
      a { color: blue; }
      a:hover { color: red; }
      .x::before { content: "@"; color: green; }
    </style></head><body><a class="x">link</a></body></html>`;
    const out = inlineEmailCss(html);
    const aTag = out.match(/<a [^>]*>/)[0];
    expect(aTag).toMatch(/color:\s*blue/);
    expect(aTag).not.toMatch(/color:\s*red/);
    expect(aTag).not.toMatch(/color:\s*green/);
  });

  it('resolves var() inside SVG attribute values', () => {
    const html = `<!doctype html><html><head><style>
      :root { --accent: #4f46e5; }
    </style></head><body><svg><circle fill="var(--accent, #000)" /></svg></body></html>`;
    const out = inlineEmailCss(html);
    expect(out).toMatch(/fill="#4f46e5"/);
    expect(out.includes('var(--')).toBe(false);
  });

  it('handles descendant + child + multi-class selectors and specificity', () => {
    const html = `<!doctype html><html><head><style>
      .card .title { color: blue; }
      .card > .title { color: green; }
      .card .title.big { color: red; }
    </style></head><body>
      <div class="card"><h1 class="title big">A</h1></div>
    </body></html>`;
    const out = inlineEmailCss(html);
    // Three rules match: blue (specificity 200), green (specificity 200, later),
    // red (specificity 300). Highest specificity wins.
    const h1 = out.match(/<h1 [^>]*>/)[0];
    expect(h1).toMatch(/color:\s*red/);
  });

  it('parses + serializes empty body cleanly', () => {
    const tree = parseHtml('<!doctype html><html><body></body></html>');
    const out = serializeHtml(tree);
    expect(out).toMatch(/<body><\/body>/);
  });
});
