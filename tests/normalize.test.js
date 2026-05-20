import { describe, it, expect } from 'vitest';
import { normalize, detectInputFormat, extractMetadata } from '../src/normalize.js';

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

describe('normalize: intent metadata (v0.6)', () => {
  it('returns empty metadata when no directives are present', () => {
    const out = normalize('# Title\n\nJust prose.\n');
    expect(out.metadata).toEqual({});
    expect(out.markdown).toBe('# Title\n\nJust prose.\n');
  });

  it('extracts a bare HTML-comment directive (boolean true)', () => {
    const out = normalize('<!-- htmd: needs-approval -->\n\n# Plan\n\nApprove?');
    expect(out.metadata).toEqual({ 'needs-approval': true });
    expect(out.markdown).not.toContain('<!--');
    expect(out.markdown).toContain('# Plan');
  });

  it('extracts an HTML-comment directive with a key=value pair', () => {
    const out = normalize('<!-- htmd: priority=high -->\n\nBody.');
    expect(out.metadata).toEqual({ priority: 'high' });
    expect(out.markdown).not.toContain('htmd:');
  });

  it('extracts multiple directives from a single comment via semicolons', () => {
    const out = normalize('<!-- htmd: needs-approval; priority=high -->\nBody.');
    expect(out.metadata).toEqual({ 'needs-approval': true, priority: 'high' });
  });

  it('extracts a fenced htmd-meta block (YAML-ish lines)', () => {
    const input = [
      '```htmd-meta',
      'needs-approval: true',
      'priority: high',
      'estimated-minutes: 5',
      '```',
      '',
      '# The plan',
      'Body.'
    ].join('\n');
    const out = normalize(input);
    expect(out.metadata).toEqual({
      'needs-approval': true,
      priority: 'high',
      'estimated-minutes': 5
    });
    expect(out.markdown).not.toContain('htmd-meta');
    expect(out.markdown.startsWith('# The plan')).toBe(true);
  });

  it('parses bool / int / float / quoted-string values', () => {
    const { metadata } = extractMetadata(
      '```htmd-meta\nbool: false\nnum: 42\nratio: 0.5\nquoted: "two words"\n```\n'
    );
    expect(metadata).toEqual({
      bool: false,
      num: 42,
      ratio: 0.5,
      quoted: 'two words'
    });
  });

  it('preserves unknown directives (forward-compatibility)', () => {
    const out = normalize('<!-- htmd: experimental-mode=beta -->\nbody');
    expect(out.metadata).toEqual({ 'experimental-mode': 'beta' });
  });

  it('merges metadata from both forms in one document', () => {
    const input = [
      '<!-- htmd: needs-approval -->',
      '',
      '```htmd-meta',
      'priority: high',
      '```',
      '',
      '# Heading'
    ].join('\n');
    const out = normalize(input);
    expect(out.metadata).toEqual({ 'needs-approval': true, priority: 'high' });
    expect(out.markdown.startsWith('# Heading')).toBe(true);
  });

  it('ignores htmd-meta-looking content inside an ordinary fenced code block', () => {
    const input = [
      'Example:',
      '```',
      'htmd-meta',
      'priority: high',
      '```',
      'Done.'
    ].join('\n');
    const out = normalize(input);
    expect(out.metadata).toEqual({});
    expect(out.markdown).toContain('priority: high');
  });

  it('strips metadata before measuring chars (length is post-strip)', () => {
    const input = '<!-- htmd: needs-approval -->\nhi';
    const out = normalize(input);
    expect(out.chars).toBe(out.markdown.length);
    expect(out.chars).toBeLessThan(input.length);
  });
});
