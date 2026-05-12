import { describe, it, expect } from 'vitest';
import { detectTemplates } from '../src/detect.js';

describe('detect: status-report', () => {
  it('fires on a doc with shipped/in-progress/blocked headings', () => {
    const md = `# Week 18\n\n## Shipped\n- A\n- B\n\n## In Progress\n- C\n\n## Blocked\n- D\n`;
    const out = detectTemplates(md);
    const hit = out.find((s) => s.template === 'status-report');
    expect(hit).toBeTruthy();
    expect(hit.confidence).toBeGreaterThan(0.5);
    expect(hit.sample_data_yaml).toContain('shipped');
  });
});

describe('detect: kanban-board', () => {
  it('fires on Backlog / Doing / Done H2s', () => {
    const md = `## Backlog\n- a\n\n## Doing\n- b\n\n## Done\n- c\n`;
    const out = detectTemplates(md);
    const hit = out.find((s) => s.template === 'kanban-board');
    expect(hit).toBeTruthy();
  });
});

describe('detect: checklist', () => {
  it('fires on a GFM task list', () => {
    const md = `# To-do\n\n- [ ] one\n- [x] two\n- [ ] three\n- [ ] four\n`;
    const out = detectTemplates(md);
    const hit = out.find((s) => s.template === 'checklist');
    expect(hit).toBeTruthy();
    expect(hit.sample_data_yaml).toContain('items');
  });
});

describe('detect: q-and-a', () => {
  it('fires on a list of question-shaped items', () => {
    const md = `- Should we ship today?\n- What about the migration?\n- Is rollback ready?\n`;
    const out = detectTemplates(md);
    const hit = out.find((s) => s.template === 'q-and-a');
    expect(hit).toBeTruthy();
  });
});

describe('detect: feedback-corrector', () => {
  it('fires on a labeled classification list', () => {
    const md = `- Email A [URGENT]\n- Email B [USEFUL]\n- Email C [NOISE]\n- Email D [USEFUL]\n`;
    const out = detectTemplates(md);
    const hit = out.find((s) => s.template === 'feedback-corrector');
    expect(hit).toBeTruthy();
  });
});

describe('detect: dashboard', () => {
  it('fires on KPI key:value lists', () => {
    const md = `- MAU: 4820\n- Revenue: $184500\n- Conversion: 3.2%\n`;
    const out = detectTemplates(md);
    const hit = out.find((s) => s.template === 'dashboard');
    expect(hit).toBeTruthy();
  });
});

describe('detect: returns nothing on unrelated prose', () => {
  it('quiet input ⇒ no suggestions above threshold', () => {
    const md = `Just a paragraph of text, nothing structured.\n\nAnother paragraph.\n`;
    const out = detectTemplates(md);
    expect(out).toEqual([]);
  });
});
