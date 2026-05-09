import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { listTemplates, loadTemplate } from '../src/templates.js';
import { renderTemplate } from '../src/render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('templates registry', () => {
  it('lists all 9 built-in templates', async () => {
    const list = await listTemplates();
    const names = list.map((t) => t.name);
    [
      'status-report',
      'dashboard',
      'decision-matrix',
      'comparison-3-up',
      'email-digest',
      'slide-deck',
      'prompt-tuner',
      'kanban-board',
      'concept-explainer'
    ].forEach((n) => expect(names).toContain(n));
  });
});

describe('each template renders its example', () => {
  const templates = [
    'status-report',
    'dashboard',
    'decision-matrix',
    'comparison-3-up',
    'email-digest',
    'slide-deck',
    'prompt-tuner',
    'kanban-board',
    'concept-explainer'
  ];

  for (const name of templates) {
    it(`renders ${name}`, async () => {
      const tpl = await loadTemplate(name);
      const examplePath = join(tpl.dir, 'example.yaml');
      expect(existsSync(examplePath), `${name}/example.yaml exists`).toBe(true);
      const data = YAML.parse(readFileSync(examplePath, 'utf8'));
      const html = await renderTemplate(name, data);
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<style>');
      expect(html).toContain('</body>');
      // Has the template attribute in body
      expect(html).toContain(`data-htmd-template="${name}"`);
      // Tier B templates ship inline JS
      const hasJs = ['slide-deck', 'prompt-tuner', 'kanban-board', 'concept-explainer'].includes(name);
      if (hasJs) expect(html).toMatch(/<script>[\s\S]*<\/script>/);
    });
  }
});

describe('html structure', () => {
  it('escapes user content in title', async () => {
    const data = { title: '<script>alert(1)</script>', metrics: [{ label: 'x', value: 1 }] };
    const html = await renderTemplate('dashboard', data);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
