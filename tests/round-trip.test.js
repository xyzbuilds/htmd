import { describe, it, expect } from 'vitest';
import { mdToHtml } from '../src/md.js';
import { htmlToMd } from '../src/html2md.js';

describe('markdown round-trip', () => {
  function normalize(md) {
    return md
      .split('\n')
      .map((l) => l.trimEnd().replace(/^(\s*[-*])\s+/, '$1 ')) // collapse list-marker spacing
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
      .join('\n')
      .trim();
  }

  it('round-trips simple paragraphs', () => {
    const src = 'Hello world.\n\nA second paragraph.';
    const out = htmlToMd(mdToHtml(src));
    expect(normalize(out)).toBe(normalize(src));
  });

  it('round-trips headings', () => {
    const src = '# Title\n\n## Subtitle\n\nBody text.';
    const out = htmlToMd(mdToHtml(src));
    expect(normalize(out)).toBe(normalize(src));
  });

  it('round-trips bullet lists', () => {
    const src = '- one\n- two\n- three';
    const out = htmlToMd(mdToHtml(src));
    expect(normalize(out)).toBe(normalize(src));
  });

  it('round-trips inline emphasis', () => {
    const src = 'This is **bold** and _italic_.';
    const out = htmlToMd(mdToHtml(src));
    expect(normalize(out)).toBe(normalize(src));
  });

  it('round-trips fenced code', () => {
    const src = '```\nconst x = 1;\n```';
    const out = htmlToMd(mdToHtml(src));
    expect(out).toContain('const x = 1;');
  });
});
