import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/render.js';

describe('schema validation', () => {
  it('rejects status-report missing title', async () => {
    let err;
    try {
      await renderTemplate('status-report', { sections: {} });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.code).toBe('HTMD_SCHEMA_INVALID');
    expect(err.message).toMatch(/title/);
  });

  it('rejects dashboard with no metrics', async () => {
    let err;
    try {
      await renderTemplate('dashboard', { title: 'X', metrics: [] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toMatch(/metrics|fewer/);
  });

  it('rejects decision-matrix missing options', async () => {
    let err;
    try {
      await renderTemplate('decision-matrix', { question: 'Q?', criteria: [{ name: 'a', weight: 1 }] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toMatch(/options/);
  });

  it('accepts valid input', async () => {
    const html = await renderTemplate('status-report', {
      title: 'Hi',
      sections: { shipped: [{ title: 'Done' }] }
    });
    expect(html).toContain('Hi');
    expect(html).toContain('Done');
  });

  it('error names the offending field', async () => {
    let err;
    try {
      await renderTemplate('decision-matrix', {
        question: 'Q?',
        criteria: [{ name: 'a' }],  // missing weight
        options: [{ name: 'opt1', scores: {} }, { name: 'opt2', scores: {} }]
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.errors).toBeDefined();
    expect(err.message).toMatch(/weight/);
  });
});
