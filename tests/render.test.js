import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { listTemplates, loadTemplate } from '../src/templates.js';
import { renderTemplate } from '../src/render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ALL_TEMPLATES = [
  'status-report',
  'dashboard',
  'decision-matrix',
  'comparison-3-up',
  'email-digest',
  'slide-deck',
  'prompt-tuner',
  'kanban-board',
  'concept-explainer',
  'feedback-corrector',
  'checklist',
  'q-and-a',
  'data-table',
  'approval-list',
  'rank-order',
  'text-redline',
  'priority-matrix',
  'chart-block',
  'code-review'
];

const INTERACTIVE_TEMPLATES = new Set([
  'slide-deck',
  'prompt-tuner',
  'kanban-board',
  'concept-explainer',
  'feedback-corrector',
  'checklist',
  'q-and-a',
  'data-table',
  'approval-list',
  'rank-order',
  'text-redline',
  'priority-matrix',
  'code-review',
  'decision-matrix',
  'comparison-3-up',
  'email-digest'
]);

describe('templates registry', () => {
  it('lists all built-in templates', async () => {
    const list = await listTemplates();
    const names = list.map((t) => t.name);
    ALL_TEMPLATES.forEach((n) => expect(names, `missing template: ${n}`).toContain(n));
  });
});

describe('each template renders its example', () => {
  for (const name of ALL_TEMPLATES) {
    it(`renders ${name}`, async () => {
      const tpl = await loadTemplate(name);
      const examplePath = join(tpl.dir, 'example.yaml');
      expect(existsSync(examplePath), `${name}/example.yaml exists`).toBe(true);
      const data = YAML.parse(readFileSync(examplePath, 'utf8'));
      const html = await renderTemplate(name, data);
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<style>');
      expect(html).toContain('</body>');
      expect(html).toContain(`data-htmd-template="${name}"`);
      if (INTERACTIVE_TEMPLATES.has(name)) {
        expect(html).toMatch(/<script>[\s\S]*<\/script>/);
      }
    });
  }
});

describe('export protocol convention', () => {
  // Every interactive template should embed its initial state with
  // data-htmd-state="<template>" so `htmd extract` can pick it up.
  const STATEFUL = [
    'feedback-corrector',
    'kanban-board',
    'checklist',
    'q-and-a',
    'data-table',
    'approval-list',
    'rank-order',
    'text-redline',
    'priority-matrix',
    'code-review',
    'decision-matrix',
    'comparison-3-up',
    'email-digest'
  ];
  for (const name of STATEFUL) {
    it(`${name} exposes data-htmd-state`, async () => {
      const tpl = await loadTemplate(name);
      const data = YAML.parse(readFileSync(join(tpl.dir, 'example.yaml'), 'utf8'));
      const html = await renderTemplate(name, data);
      expect(html).toContain(`data-htmd-state="${name}"`);
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
