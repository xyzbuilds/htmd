import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintMarkdown, formatLintResult } from '../src/lint.js';
import { callTool } from '../src/mcp-server/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const FIX = resolve(__dirname, 'fixtures/lint');
const BIN = resolve(ROOT, 'bin/htmd.js');

function readFix(name) {
  return readFileSync(resolve(FIX, name), 'utf8');
}

function runCli(args, { stdin } = {}) {
  const r = spawnSync('node', [BIN, ...args], {
    input: stdin,
    encoding: 'utf8',
    timeout: 15000
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('lint: rule coverage', () => {
  it('clean.md → no errors, no warnings', async () => {
    const md = readFix('clean.md');
    const r = await lintMarkdown(md, { filePath: 'clean.md' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('multi-fence-clean.md → no errors across multiple fences', async () => {
    const md = readFix('multi-fence-clean.md');
    const r = await lintMarkdown(md, { filePath: 'multi-fence-clean.md' });
    expect(r.errors).toEqual([]);
  });

  it('unknown-template → unknown-template error at the fence open line', async () => {
    const md = readFix('unknown-template.md');
    const r = await lintMarkdown(md, { filePath: 'unknown-template.md' });
    expect(r.errors.length).toBe(1);
    const e = r.errors[0];
    expect(e.rule).toBe('unknown-template');
    expect(e.line).toBe(3);
    expect(e.col).toBe(1);
    expect(e.message).toMatch(/not-a-real-template/);
  });

  it('bad-yaml → parse-error pointing at the body', async () => {
    const md = readFix('bad-yaml.md');
    const r = await lintMarkdown(md, { filePath: 'bad-yaml.md' });
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].rule).toBe('parse-error');
    expect(r.errors[0].line).toBe(2);
  });

  it('schema-error → schema-error naming the missing field', async () => {
    const md = readFix('schema-error.md');
    const r = await lintMarkdown(md, { filePath: 'schema-error.md' });
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].rule).toBe('schema-error');
    expect(r.errors[0].message).toMatch(/missing required field: title/);
  });

  it('unclosed-fence → unclosed-fence error at the open line', async () => {
    const md = readFix('unclosed-fence.md');
    const r = await lintMarkdown(md, { filePath: 'unclosed-fence.md' });
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].rule).toBe('unclosed-fence');
    expect(r.errors[0].line).toBe(3);
  });

  it('nested-htmd → nested-htmd error at the nested fence body line', async () => {
    const md = readFix('nested-htmd.md');
    const r = await lintMarkdown(md, { filePath: 'nested-htmd.md' });
    expect(r.errors.some((e) => e.rule === 'nested-htmd')).toBe(true);
    const ne = r.errors.find((e) => e.rule === 'nested-htmd');
    expect(ne.message).toMatch(/cannot be nested/);
    // The line points inside the outer fence body, not at the outer open.
    expect(ne.line).toBeGreaterThan(2);
  });

  it('bad-meta → mix of meta-bad-value + meta-bad-key errors + meta-unknown-directive warning', async () => {
    const md = readFix('bad-meta.md');
    const r = await lintMarkdown(md, { filePath: 'bad-meta.md' });
    const rules = r.errors.map((e) => e.rule).sort();
    expect(rules).toContain('meta-bad-value');
    expect(rules).toContain('meta-bad-key');
    expect(r.warnings.some((w) => w.rule === 'meta-unknown-directive')).toBe(true);
    const bv = r.errors.find((e) => e.rule === 'meta-bad-value');
    expect(bv.message).toMatch(/needs-approval/);
  });
});

describe('lint: empty / trivial inputs', () => {
  it('empty string → no errors', async () => {
    const r = await lintMarkdown('', { filePath: 'empty.md' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('null input → no errors', async () => {
    const r = await lintMarkdown(null);
    expect(r.errors).toEqual([]);
  });

  it('plain markdown with no htmd fences → no errors', async () => {
    const r = await lintMarkdown('# Title\n\nJust prose.\n\n```js\nconst x = 1;\n```\n');
    expect(r.errors).toEqual([]);
  });
});

describe('lint: htmd-meta values', () => {
  it('accepts boolean true/false on routing directives', async () => {
    const md = '```htmd-meta\nneeds-approval: true\nprefer-inline: false\n```\n';
    const r = await lintMarkdown(md);
    expect(r.errors).toEqual([]);
  });

  it('rejects non-boolean on a boolean routing directive', async () => {
    const md = '```htmd-meta\nprefer-page: yes\n```\n';
    const r = await lintMarkdown(md);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0].rule).toBe('meta-bad-value');
  });

  it('warns but does not error on unknown annotation directives', async () => {
    const md = '```htmd-meta\nfoo: bar\n```\n';
    const r = await lintMarkdown(md);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0].rule).toBe('meta-unknown-directive');
  });
});

describe('lint: CLI exit codes + format', () => {
  it('exit 0 on clean fixture', () => {
    const r = runCli(['lint', resolve(FIX, 'clean.md')]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('exit 1 on lint errors', () => {
    const r = runCli(['lint', resolve(FIX, 'unknown-template.md')]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/unknown-template/);
  });

  it('exit 2 on unreadable file', () => {
    const r = runCli(['lint', '/tmp/does-not-exist-' + Date.now() + '.md']);
    expect(r.status).toBe(2);
  });

  it('--format=json emits parseable JSON envelope', () => {
    const r = runCli(['lint', '--format=json', resolve(FIX, 'unknown-template.md')]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toHaveProperty('errors');
    expect(parsed).toHaveProperty('warnings');
    expect(parsed.errors[0].rule).toBe('unknown-template');
    expect(parsed.errors[0].line).toBe(3);
    expect(parsed.errors[0].col).toBe(1);
  });

  it('reads from stdin when file is "-"', () => {
    const r = runCli(['lint', '-'], {
      stdin: '```htmd:nope\nfoo: bar\n```\n'
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/unknown-template/);
  });

  it('error lines include file:line:col format', () => {
    const r = runCli(['lint', resolve(FIX, 'unknown-template.md')]);
    expect(r.stdout).toMatch(new RegExp(`${resolve(FIX, 'unknown-template.md')}:3:1:`));
  });
});

describe('lint: JSON output snapshot', () => {
  it('unknown-template fixture stable shape', () => {
    const r = runCli(['lint', '--format=json', resolve(FIX, 'unknown-template.md')]);
    const parsed = JSON.parse(r.stdout);
    // Normalize the absolute file path for the snapshot.
    for (const e of parsed.errors) e.file = '<fix>/unknown-template.md';
    expect(parsed).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "col": 1,
            "file": "<fix>/unknown-template.md",
            "line": 3,
            "message": "Unknown template "not-a-real-template". Run \`htmd templates\` to list. (e.g.: approval-list, chart-block, checklist, code-diff, code-review, comparison-3-up, concept-explainer, dashboard…)",
            "rule": "unknown-template",
          },
        ],
        "warnings": [],
      }
    `);
  });

  it('schema-error fixture stable shape', () => {
    const r = runCli(['lint', '--format=json', resolve(FIX, 'schema-error.md')]);
    const parsed = JSON.parse(r.stdout);
    for (const e of parsed.errors) e.file = '<fix>/schema-error.md';
    expect(parsed).toMatchInlineSnapshot(`
      {
        "errors": [
          {
            "col": 1,
            "file": "<fix>/schema-error.md",
            "line": 4,
            "message": "htmd:status-report data: missing required field: title",
            "rule": "schema-error",
          },
        ],
        "warnings": [],
      }
    `);
  });
});

describe('lint: formatLintResult', () => {
  it('text mode is empty when there are no issues', () => {
    expect(formatLintResult({ errors: [], warnings: [] })).toBe('');
  });

  it('text mode formats one line per issue', () => {
    const issue = { file: 'x.md', line: 3, col: 1, rule: 'unknown-template', message: 'nope' };
    const out = formatLintResult({ errors: [issue], warnings: [] });
    expect(out).toBe('x.md:3:1: error[unknown-template]: nope\n');
  });

  it('json mode includes both arrays even when empty', () => {
    const out = JSON.parse(formatLintResult({ errors: [], warnings: [] }, { format: 'json' }));
    expect(out).toEqual({ errors: [], warnings: [] });
  });
});

describe('lint: MCP tool htmd_lint', () => {
  it('returns ok=true on clean markdown', async () => {
    const r = await callTool('htmd_lint', { markdown: readFix('clean.md'), filePath: 'clean.md' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r._debug.cli_equivalent).toMatch(/htmd lint/);
  });

  it('returns ok=false with errors[] on dirty markdown', async () => {
    const r = await callTool('htmd_lint', { markdown: readFix('unknown-template.md'), filePath: 'u.md' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].rule).toBe('unknown-template');
  });

  it('uses <stdin> as default file label when filePath omitted', async () => {
    const r = await callTool('htmd_lint', { markdown: '```htmd:bogus\nx: 1\n```\n' });
    expect(r.errors[0].file).toBe('<stdin>');
  });
});
