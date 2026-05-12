import { describe, it, expect } from 'vitest';
import { composeFromMarkdown, parseSegments } from '../src/compose.js';

describe('compose: parseSegments', () => {
  it('returns a single prose segment when there are no fences', () => {
    const segs = parseSegments('Hello\n\nWorld.');
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('prose');
  });

  it('splits prose around an htmd:<template> fence', () => {
    const md = `# Title\n\nSome words.\n\n\`\`\`htmd:status-report\ntitle: X\nsections: { shipped: [{ title: foo }] }\n\`\`\`\n\nMore words.\n`;
    const segs = parseSegments(md);
    const types = segs.map((s) => s.type);
    expect(types).toEqual(['prose', 'block', 'prose']);
    expect(segs[1].template).toBe('status-report');
    expect(segs[1].data.title).toBe('X');
  });

  it('captures parse error for invalid yaml in a fence', () => {
    const md = "```htmd:status-report\n: : :\nbad\n```\n";
    const segs = parseSegments(md);
    expect(segs[0].type).toBe('block');
    expect(segs[0].parseError).toBeTruthy();
  });

  it('also accepts `htmd <name>` (space) as the fence language', () => {
    const md = "```htmd status-report\ntitle: t\nsections: {}\n```\n";
    const segs = parseSegments(md);
    expect(segs[0].type).toBe('block');
    expect(segs[0].template).toBe('status-report');
  });
});

describe('compose: end-to-end', () => {
  it('renders prose + a single template fence into one document', async () => {
    const md = `# Sprint review\n\nIntro line.\n\n\`\`\`htmd:status-report\ntitle: Week\nsections: { shipped: [{ title: thing }] }\n\`\`\`\n\nOutro.\n`;
    const { html, errors, blocks } = await composeFromMarkdown(md);
    expect(errors).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].template).toBe('status-report');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Intro line.');
    expect(html).toContain('Outro.');
    expect(html).toContain('thing');
    expect(html).toContain('class="htmd-block"');
    expect(html).toContain('Sprint review');
  });

  it('mixes multiple different templates in one document and dedupes their CSS', async () => {
    const md = `# Combined\n\n\`\`\`htmd:status-report\ntitle: A\nsections: { shipped: [{title: s1}] }\n\`\`\`\n\nbetween\n\n\`\`\`htmd:dashboard\ntitle: B\nmetrics: [{label: x, value: 1}]\n\`\`\`\n`;
    const { html, errors, blocks } = await composeFromMarkdown(md);
    expect(errors).toEqual([]);
    expect(blocks.map((b) => b.template)).toEqual(['status-report', 'dashboard']);
    expect(html).toContain('s1');
    expect(html).toContain('htmd-block');
  });

  it('shows a compose-level export FAB when interactive blocks are present', async () => {
    const md = `\`\`\`htmd:checklist\ntitle: T\nitems: [{title: A}, {title: B}]\n\`\`\`\n`;
    const { html } = await composeFromMarkdown(md);
    expect(html).toContain('data-htmd-cx-export');
    expect(html).toContain('window.__htmd');
  });

  it('does NOT add a compose FAB when only non-interactive blocks are present', async () => {
    const md = `\`\`\`htmd:status-report\ntitle: T\nsections: { shipped: [{title: x}] }\n\`\`\`\n`;
    const { html } = await composeFromMarkdown(md);
    expect(html).not.toContain('data-htmd-cx-export');
  });

  it('includes the Telegram WebApp SDK script in compose output (Mini App support)', async () => {
    const md = `\`\`\`htmd:checklist\ntitle: T\nitems: [{title: A}]\n\`\`\`\n`;
    const { html } = await composeFromMarkdown(md);
    expect(html).toContain('telegram.org/js/telegram-web-app.js');
  });

  it('wires Mini App detection + MainButton path in the compose bridge JS', async () => {
    const md = `\`\`\`htmd:checklist\ntitle: T\nitems: [{title: A}]\n\`\`\`\n`;
    const { html } = await composeFromMarkdown(md);
    expect(html).toContain('isMiniApp');
    expect(html).toContain('sendViaTelegram');
    expect(html).toContain('tg.MainButton');
    expect(html).toContain('tg.sendData');
  });

  it('inlines a per-block error card for an invalid block instead of failing the whole page', async () => {
    const md = `# Title\n\n\`\`\`htmd:status-report\nthis: is: invalid: yaml: : :\n\`\`\`\n\n\`\`\`htmd:dashboard\ntitle: ok\nmetrics: [{label: x, value: 1}]\n\`\`\`\n`;
    const { html, errors } = await composeFromMarkdown(md);
    // status-report is invalid (no `title`), dashboard is fine
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain('htmd-block-error');
    // Good block still rendered:
    expect(html).toContain('htmd-block');
  });
});
