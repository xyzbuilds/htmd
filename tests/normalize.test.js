import { describe, it, expect } from 'vitest';
import { normalize, detectInputFormat } from '../src/normalize.js';

describe('normalize: format detection', () => {
  it('detects Markdown via heading', () => {
    expect(detectInputFormat('# Hello\n\nWorld')).toBe('markdown');
  });

  it('detects Markdown via GFM table', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    expect(detectInputFormat(md)).toBe('markdown');
  });

  it('detects Telegram-flavored HTML when tags are outside fenced blocks', () => {
    expect(detectInputFormat('Try <b>this</b> approach.')).toBe('telegram-html');
  });

  it('ignores tags that only appear inside fenced code blocks', () => {
    const s = 'Example:\n```\n<b>not real</b>\n```\nDone.';
    expect(detectInputFormat(s)).toBe('markdown');
  });

  it('falls back to plain text', () => {
    expect(detectInputFormat('just a sentence with no structure')).toBe('plain');
  });
});

describe('normalize: 2026-05-12 regression', () => {
  it('Telegram-HTML <code>v0.4.0</code> becomes CommonMark backticks', () => {
    const input = 'Bumped to <code>v0.4.0</code> and shipped.';
    const out = normalize(input);
    expect(out.format).toBe('telegram-html');
    expect(out.markdown).toContain('`v0.4.0`');
    expect(out.markdown).not.toContain('<code>');
  });

  it('Telegram-HTML mixed bold + code round-trips to Markdown', () => {
    const input = '<b>Phase 3</b>: routing + <code>htmd route</code>';
    const out = normalize(input);
    expect(out.format).toBe('telegram-html');
    expect(out.markdown).toContain('**Phase 3**');
    expect(out.markdown).toContain('`htmd route`');
  });
});

describe('normalize: pass-through', () => {
  it('canonical CommonMark passes through unchanged', () => {
    const md = '# Title\n\nBody with **bold** and `code`.\n';
    const out = normalize(md);
    expect(out.format).toBe('markdown');
    expect(out.markdown).toBe(md);
  });

  it('plain text wraps as-is', () => {
    const txt = 'just a one-liner reply';
    const out = normalize(txt);
    expect(out.format).toBe('plain');
    expect(out.markdown).toBe(txt);
  });

  it('null input is empty', () => {
    const out = normalize(null);
    expect(out.markdown).toBe('');
    expect(out.chars).toBe(0);
  });
});

describe('normalize: hint override', () => {
  it('honors an explicit hint over auto-detect', () => {
    const out = normalize('# heading', { hint: 'plain' });
    expect(out.format).toBe('plain');
    expect(out.markdown).toBe('# heading');
  });
});
