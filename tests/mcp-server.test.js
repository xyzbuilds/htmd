// Tests for the htmd MCP server (v0.8.0).
//
// The contract we exercise:
//   1. Each tool produces byte-identical output to the equivalent CLI code path
//      (we call the same exported function the CLI calls, so this reduces to
//      "tool result equals direct function call").
//   2. The server is stateless — same inputs produce the same outputs across
//      independent calls.
//   3. Errors come back as MCP tool responses with isError: true and a
//      structured JSON envelope.
//   4. Every successful tool response carries _debug.cli_equivalent.
//   5. The JSON-RPC protocol layer handles initialize, tools/list, tools/call,
//      ping, notifications, and unknown methods correctly.

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { createHandler, startStdioServer } from '../src/mcp-server/index.js';
import { listTools, callTool } from '../src/mcp-server/tools.js';
import { renderTemplate } from '../src/render.js';
import { composeFromMarkdown } from '../src/compose.js';
import { normalize as normalizeFn } from '../src/normalize.js';
import { route as routeFn } from '../src/route.js';
import { detectTemplates } from '../src/detect.js';
import { extractState } from '../src/extract.js';
import { listTemplates, loadTemplate } from '../src/templates.js';
import { loadConfig } from '../src/config.js';

const handle = createHandler({ version: '0.8.0-test' });

async function callViaHandle(toolName, args) {
  const resp = await handle('tools/call', { name: toolName, arguments: args });
  expect(resp.content).toHaveLength(1);
  expect(resp.content[0].type).toBe('text');
  const payload = JSON.parse(resp.content[0].text);
  return { resp, payload };
}

// -------- protocol layer --------

describe('mcp protocol: initialize', () => {
  it('returns server info + capabilities', async () => {
    const r = await handle('initialize', {});
    expect(r.protocolVersion).toBeDefined();
    expect(r.serverInfo).toEqual({ name: 'htmd', version: '0.8.0-test' });
    expect(r.capabilities.tools).toBeDefined();
  });

  it('accepts notifications/initialized as a no-op', async () => {
    const r = await handle('notifications/initialized', {});
    expect(r).toBeNull();
  });

  it('responds to ping', async () => {
    const r = await handle('ping', {});
    expect(r).toEqual({});
  });
});

describe('mcp protocol: tools/list', () => {
  it('lists every tool with name + description + JSON schema', async () => {
    const r = await handle('tools/list', {});
    expect(Array.isArray(r.tools)).toBe(true);
    for (const t of r.tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.inputSchema && t.inputSchema.type).toBe('object');
    }
    const names = r.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'htmd_render', 'htmd_compose', 'htmd_route', 'htmd_normalize',
      'htmd_detect', 'htmd_extract', 'htmd_templates', 'htmd_schema'
    ]));
  });

  it('each tool name maps 1:1 to an existing CLI subcommand (prefix htmd_)', () => {
    const cliSubcommands = new Set([
      'render', 'compose', 'route', 'normalize', 'detect', 'extract', 'templates', 'schema', 'lint'
    ]);
    for (const t of listTools()) {
      expect(t.name).toMatch(/^htmd_/);
      expect(cliSubcommands.has(t.name.slice('htmd_'.length))).toBe(true);
    }
  });
});

describe('mcp protocol: unknown method', () => {
  it('throws an RpcError with METHOD_NOT_FOUND code', async () => {
    await expect(handle('not_a_method', {})).rejects.toMatchObject({
      rpcCode: -32601
    });
  });
});

describe('mcp protocol: unknown tool', () => {
  it('throws METHOD_NOT_FOUND on tools/call with unknown name', async () => {
    await expect(handle('tools/call', { name: 'nope', arguments: {} })).rejects.toMatchObject({
      rpcCode: -32601
    });
  });
});

// -------- byte-identical output guarantees --------

describe('mcp tool byte-identical output: htmd_render', () => {
  const sample = {
    title: 'Hi',
    sections: {
      shipped: [{ title: 'a thing' }],
      in_progress: [{ title: 'another', eta: 'tomorrow' }]
    }
  };

  it('produces the same HTML as renderTemplate() directly', async () => {
    const direct = await renderTemplate('status-report', sample);
    const { payload } = await callViaHandle('htmd_render', { template: 'status-report', data: sample });
    expect(payload.ok).toBe(true);
    expect(payload.html).toBe(direct);
  });

  it('accepts dataYaml and produces the same HTML as the parsed-data path', async () => {
    const yaml = 'title: Hi\nsections:\n  shipped:\n    - title: a thing\n  in_progress:\n    - title: another\n      eta: tomorrow\n';
    const direct = await renderTemplate('status-report', sample);
    const { payload } = await callViaHandle('htmd_render', { template: 'status-report', dataYaml: yaml });
    expect(payload.html).toBe(direct);
  });

  it('attaches _debug.cli_equivalent', async () => {
    const { payload } = await callViaHandle('htmd_render', { template: 'status-report', data: sample });
    expect(payload._debug.cli_equivalent).toMatch(/^htmd render status-report /);
  });
});

describe('mcp tool byte-identical output: htmd_compose', () => {
  it('produces the same HTML as composeFromMarkdown() directly', async () => {
    const md = '# Hello\n\nProse paragraph.\n\n```htmd:checklist\ntitle: To-do\nitems:\n  - text: Buy milk\n```\n';
    const direct = await composeFromMarkdown(md);
    const { payload } = await callViaHandle('htmd_compose', { markdown: md });
    expect(payload.ok).toBe(true);
    expect(payload.html).toBe(direct.html);
    expect(payload.errors).toEqual(direct.errors);
    expect(payload.blocks).toEqual(direct.blocks);
  });
});

describe('mcp tool byte-identical output: htmd_normalize', () => {
  it('produces the same envelope as normalize() directly', async () => {
    const input = '<!-- htmd: needs-approval -->\nThe plan.\n';
    const direct = normalizeFn(input);
    const { payload } = await callViaHandle('htmd_normalize', { input });
    expect(payload.result).toEqual(direct);
  });

  it('honours --hint via the hint arg', async () => {
    const input = '<b>bold</b>';
    const direct = normalizeFn(input, { hint: 'telegram-html' });
    const { payload } = await callViaHandle('htmd_normalize', { input, hint: 'telegram-html' });
    expect(payload.result).toEqual(direct);
  });
});

describe('mcp tool byte-identical output: htmd_route', () => {
  it('produces the same decision shape as route() via the CLI code path', async () => {
    const input = 'short reply';
    const { config } = loadConfig();
    const norm = normalizeFn(input);
    const direct = routeFn(norm.markdown, { config, alreadyNormalized: true, metadata: norm.metadata });
    direct.input.format = norm.format;
    direct.input.chars = norm.chars;
    const { payload } = await callViaHandle('htmd_route', { input });
    expect(payload.decision).toEqual(direct);
  });

  it('respects intent flags', async () => {
    const { payload } = await callViaHandle('htmd_route', { input: 'x', needsApproval: true });
    expect(payload.decision.action).toBe('page');
    expect(payload.decision.reason).toBe('intent:needs-approval');
  });
});

describe('mcp tool byte-identical output: htmd_detect', () => {
  it('produces the same suggestion list as detectTemplates() (post-filter)', async () => {
    const md = '## Shipped\n- foo\n\n## In Progress\n- bar\n\n## Blocked\n- baz\n';
    const direct = detectTemplates(md).filter((s) => s.confidence >= 0.45);
    const { payload } = await callViaHandle('htmd_detect', { markdown: md });
    expect(payload.suggestions).toEqual(direct);
  });
});

describe('mcp tool byte-identical output: htmd_extract', () => {
  it('produces the same state list as extractState() directly', async () => {
    const html = '<script type="application/json" data-htmd-state="checklist">{"items":[{"text":"x","checked":true}]}</script>';
    const direct = extractState(html);
    const { payload } = await callViaHandle('htmd_extract', { html });
    expect(payload.states).toEqual(direct);
  });
});

describe('mcp tool byte-identical output: htmd_templates / htmd_schema', () => {
  it('htmd_templates matches listTemplates()', async () => {
    const direct = await listTemplates();
    const { payload } = await callViaHandle('htmd_templates', {});
    expect(payload.templates.map((t) => t.name)).toEqual(direct.map((t) => t.name));
  });

  it('htmd_schema matches loadTemplate().schema', async () => {
    const tpl = await loadTemplate('status-report');
    const { payload } = await callViaHandle('htmd_schema', { template: 'status-report' });
    expect(payload.schema).toEqual(tpl.schema || {});
  });
});

// -------- statelessness --------

describe('mcp server is stateless', () => {
  it('same inputs to htmd_render produce byte-identical output across calls', async () => {
    const args = { template: 'status-report', data: { title: 'Same', sections: [] } };
    const a = await callViaHandle('htmd_render', args);
    const b = await callViaHandle('htmd_render', args);
    expect(a.payload.html).toBe(b.payload.html);
  });

  it('handler instances are independent (no shared mutable state)', async () => {
    const h1 = createHandler({ version: '1' });
    const h2 = createHandler({ version: '2' });
    const r1 = await h1('initialize', {});
    const r2 = await h2('initialize', {});
    expect(r1.serverInfo.version).toBe('1');
    expect(r2.serverInfo.version).toBe('2');
  });
});

// -------- error envelopes --------

describe('mcp tool error envelopes', () => {
  it('returns isError: true with a structured payload on missing required arg', async () => {
    const resp = await handle('tools/call', { name: 'htmd_render', arguments: {} });
    expect(resp.isError).toBe(true);
    const payload = JSON.parse(resp.content[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/data/i);
  });

  it('returns isError: true on schema validation failure', async () => {
    // status-report requires title; pass an invalid object.
    const resp = await handle('tools/call', {
      name: 'htmd_render',
      arguments: { template: 'status-report', data: { not_title: 'oops' } }
    });
    expect(resp.isError).toBe(true);
    const payload = JSON.parse(resp.content[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/[Ss]chema/);
  });

  it('returns isError: true on invalid YAML in dataYaml', async () => {
    const resp = await handle('tools/call', {
      name: 'htmd_render',
      arguments: { template: 'status-report', dataYaml: ': : : not yaml' }
    });
    expect(resp.isError).toBe(true);
  });
});

// -------- full stdio integration --------

describe('mcp stdio integration (newline-delimited JSON-RPC)', () => {
  it('handshakes + lists tools + calls a tool over real streams', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const collected = [];
    output.on('data', (chunk) => collected.push(chunk.toString('utf8')));

    const done = startStdioServer({ version: '0.8.0-test', input, output });

    input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    input.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    input.write(JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'htmd_normalize', arguments: { input: 'plain hello' } }
    }) + '\n');
    input.end();

    await done;

    const lines = collected.join('').split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).not.toMatch(/\r/);
      const msg = JSON.parse(line);
      expect(msg.jsonrpc).toBe('2.0');
    }
    const init = JSON.parse(lines[0]);
    expect(init.result.serverInfo.name).toBe('htmd');
    const list = JSON.parse(lines[1]);
    expect(list.result.tools.length).toBeGreaterThan(0);
    const call = JSON.parse(lines[2]);
    expect(call.result.isError).toBe(false);
    const payload = JSON.parse(call.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.result.markdown).toBe('plain hello');
  });

  it('handles malformed JSON with a parse error response', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const collected = [];
    output.on('data', (chunk) => collected.push(chunk.toString('utf8')));

    const done = startStdioServer({ version: '0.8.0-test', input, output });
    input.write('{not json}\n');
    input.end();
    await done;

    const lines = collected.join('').split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const msg = JSON.parse(lines[0]);
    expect(msg.error.code).toBe(-32700);
  });
});

// -------- direct tool dispatch parity --------

describe('mcp callTool() matches CLI subcommand semantics', () => {
  it('callTool returns the same payload shape as the handler path', async () => {
    const direct = await callTool('htmd_normalize', { input: 'hello' });
    const { payload } = await callViaHandle('htmd_normalize', { input: 'hello' });
    expect(payload).toEqual(direct);
  });
});
