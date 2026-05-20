// MCP tool registry for htmd. Each tool is a thin wrapper over the exported
// function the CLI calls — no parallel implementation, no MCP-only features.
//
// Design constraints (locked for v0.8.0; see PHASE3_NOTES.md):
//   1. Tools map 1:1 to existing CLI subcommands.
//   2. Each tool calls the same exported function the CLI calls.
//   3. Zero state across calls.
//   4. Every response includes _debug.cli_equivalent so the user can
//      reproduce the call on the shell.

import YAML from 'yaml';
import { renderTemplate, renderMarkdown } from '../render.js';
import { composeFromMarkdown } from '../compose.js';
import { route as routeMessage } from '../route.js';
import { normalize as normalizeInput } from '../normalize.js';
import { detectTemplates } from '../detect.js';
import { extractState } from '../extract.js';
import { listTemplates, loadTemplate } from '../templates.js';
import { loadConfig } from '../config.js';

// Shell-escape a single argument. Used to build cli_equivalent strings the
// user can paste into a terminal.
function shq(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s === '') return "''";
  if (/^[A-Za-z0-9_\-./:=,]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// Pipe content into a CLI command — used when the input is too large to
// reasonably show inline as a flag value.
function withStdinHint(cliCmd, inputName) {
  return `<${inputName}> | ${cliCmd}`;
}

const TOOLS = {};

function defineTool(name, def) {
  TOOLS[name] = { name, ...def };
}

// ---------- htmd_render ----------
defineTool('htmd_render', {
  description:
    'Render an htmd template with structured data. Returns a self-contained HTML document. ' +
    'Maps 1:1 to `htmd render <template>`. Provide `data` as a JSON object, or `dataYaml` / ' +
    '`dataJson` as a raw string. The server is stateless: every call re-renders from inputs.',
  inputSchema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Template name (run htmd_templates to list).' },
      data: { type: 'object', description: 'Parsed data object passed to the template.' },
      dataYaml: { type: 'string', description: 'Raw YAML to parse into data (alternative to `data`).' },
      dataJson: { type: 'string', description: 'Raw JSON to parse into data (alternative to `data`).' },
      validate: { type: 'boolean', default: true, description: 'Run schema validation.' },
      lang: { type: 'string', description: 'Document lang attribute (default: en).' },
      mode: {
        type: 'string',
        enum: ['web', 'email'],
        default: 'web',
        description: 'Render mode. "web" (default) is the standard self-contained interactive page. "email" inlines all CSS, strips scripts/style/link tags, resolves CSS custom properties, and produces HTML safe to paste into Gmail/Outlook compose.'
      }
    },
    required: ['template']
  },
  async handler(args) {
    const data = resolveData(args);
    const html = await renderTemplate(args.template, data, {
      validate: args.validate !== false,
      lang: args.lang,
      mode: args.mode
    });
    return {
      ok: true,
      html,
      _debug: {
        cli_equivalent: buildRenderCli(args)
      }
    };
  }
});

function resolveData(args) {
  if (args.data !== undefined) return args.data;
  if (typeof args.dataJson === 'string') {
    try { return JSON.parse(args.dataJson); } catch (e) {
      throw new Error(`dataJson is not valid JSON: ${e.message}`);
    }
  }
  if (typeof args.dataYaml === 'string') {
    try { return YAML.parse(args.dataYaml); } catch (e) {
      throw new Error(`dataYaml is not valid YAML: ${e.message}`);
    }
  }
  throw new Error('htmd_render requires `data`, `dataYaml`, or `dataJson`.');
}

function buildRenderCli(args) {
  const parts = ['htmd', 'render', shq(args.template)];
  if (args.data !== undefined) {
    parts.push('--inline', shq(JSON.stringify(args.data)));
  } else if (args.dataJson) {
    parts.push('--inline', shq(args.dataJson));
  } else if (args.dataYaml) {
    parts.push('--data', '-');
  }
  if (args.validate === false) parts.push('--no-validate');
  if (args.mode && args.mode !== 'web') parts.push('--mode', shq(args.mode));
  const cmd = parts.join(' ');
  if (args.dataYaml) return `echo ${shq(args.dataYaml)} | ${cmd}`;
  return cmd;
}

// ---------- htmd_compose ----------
defineTool('htmd_compose', {
  description:
    'Compose a Markdown source (with embedded ```htmd:<template>``` fences) into a single ' +
    'self-contained HTML page. Maps 1:1 to `htmd compose`. Prose becomes prose; each fence ' +
    'becomes a rendered template, all sharing one shell.',
  inputSchema: {
    type: 'object',
    properties: {
      markdown: { type: 'string', description: 'The Markdown source.' },
      title: { type: 'string', description: 'Page title (default: first H1).' },
      validate: { type: 'boolean', default: true, description: 'Validate each block against its schema.' }
    },
    required: ['markdown']
  },
  async handler(args) {
    const result = await composeFromMarkdown(args.markdown, {
      title: args.title,
      validate: args.validate !== false
    });
    return {
      ok: true,
      html: result.html,
      blocks: result.blocks,
      errors: result.errors,
      _debug: {
        cli_equivalent: withStdinHint(
          ['htmd', 'compose', args.title ? `--title ${shq(args.title)}` : '', args.validate === false ? '--no-validate' : '']
            .filter(Boolean).join(' '),
          'markdown'
        )
      }
    };
  }
});

// ---------- htmd_route ----------
defineTool('htmd_route', {
  description:
    'Decide whether an agent reply should go inline or as an htmd page. Maps 1:1 to ' +
    '`htmd route`. Returns the routing decision JSON. The MCP variant does NOT publish ' +
    'via a transport (that would require host-side state); call htmd_render afterward if ' +
    'you want to render the page and use a CLI/adapter to publish.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The agent message text to route.' },
      lengthThreshold: { type: 'number', description: 'Override config lengthThreshold (default 1500).' },
      fencedBlockMinLines: { type: 'number', description: 'Override config fencedBlockMinLines (default 10).' },
      needsApproval: { type: 'boolean', description: 'Force routing to a page with an approval control.' },
      preferInline: { type: 'boolean', description: 'Force inline regardless of length/structure.' },
      preferPage: { type: 'boolean', description: 'Force a page regardless of length/structure.' }
    },
    required: ['input']
  },
  async handler(args) {
    const { config } = loadConfig();
    const norm = normalizeInput(args.input);
    const decision = routeMessage(norm.markdown, {
      config,
      alreadyNormalized: true,
      metadata: norm.metadata,
      lengthThreshold: args.lengthThreshold,
      fencedBlockMinLines: args.fencedBlockMinLines,
      needsApproval: !!args.needsApproval,
      preferInline: !!args.preferInline,
      preferPage: !!args.preferPage
    });
    decision.input.format = norm.format;
    decision.input.chars = norm.chars;
    return {
      ok: true,
      decision,
      _debug: {
        cli_equivalent: withStdinHint(
          ['htmd', 'route',
            args.lengthThreshold ? `--length-threshold ${shq(args.lengthThreshold)}` : '',
            args.fencedBlockMinLines ? `--fenced-min-lines ${shq(args.fencedBlockMinLines)}` : '',
            args.needsApproval ? '--needs-approval' : '',
            args.preferInline ? '--prefer-inline' : '',
            args.preferPage ? '--prefer-page' : ''
          ].filter(Boolean).join(' '),
          'input'
        )
      }
    };
  }
});

// ---------- htmd_normalize ----------
defineTool('htmd_normalize', {
  description:
    'Canonicalize an agent message (Markdown / Telegram-flavored HTML / plain text) to ' +
    'CommonMark, and extract any embedded htmd intent metadata. Maps 1:1 to `htmd normalize`.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The agent message to normalize.' },
      hint: {
        type: 'string',
        enum: ['markdown', 'telegram-html', 'plain'],
        description: 'Force input format detection.'
      }
    },
    required: ['input']
  },
  async handler(args) {
    const result = normalizeInput(args.input, { hint: args.hint });
    return {
      ok: true,
      result,
      _debug: {
        cli_equivalent: withStdinHint(
          ['htmd', 'normalize', '--json', args.hint ? `--hint ${shq(args.hint)}` : '']
            .filter(Boolean).join(' '),
          'input'
        )
      }
    };
  }
});

// ---------- htmd_detect ----------
defineTool('htmd_detect', {
  description:
    'Scan a Markdown file and suggest which htmd templates would render each region. ' +
    'Maps 1:1 to `htmd detect`. Returns suggestions filtered by confidence.',
  inputSchema: {
    type: 'object',
    properties: {
      markdown: { type: 'string', description: 'The Markdown source to scan.' },
      minConfidence: { type: 'number', default: 0.45, description: 'Minimum confidence (0-1).' }
    },
    required: ['markdown']
  },
  async handler(args) {
    const min = typeof args.minConfidence === 'number' ? args.minConfidence : 0.45;
    const suggestions = detectTemplates(args.markdown).filter((s) => s.confidence >= min);
    return {
      ok: true,
      suggestions,
      _debug: {
        cli_equivalent: withStdinHint(
          `htmd detect --json --min-confidence ${shq(min)}`,
          'markdown'
        )
      }
    };
  }
});

// ---------- htmd_extract ----------
defineTool('htmd_extract', {
  description:
    'Read a rendered htmd HTML file and emit any embedded state (kanban moves, feedback ' +
    'corrections, etc.) as JSON. Maps 1:1 to `htmd extract`. Closes the bidirectional loop ' +
    'after a user interacts with a page in the browser.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'The HTML source of a rendered htmd page.' }
    },
    required: ['html']
  },
  async handler(args) {
    const states = extractState(args.html);
    return {
      ok: true,
      states,
      _debug: {
        cli_equivalent: withStdinHint('htmd extract --json', 'html')
      }
    };
  }
});

// ---------- htmd_templates ----------
defineTool('htmd_templates', {
  description:
    'List all available htmd templates (built-ins + auto-discovered plugins). Maps 1:1 ' +
    'to `htmd templates --json`. Use this to discover what htmd_render can target.',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const list = await listTemplates();
    return {
      ok: true,
      templates: list.map((t) => ({ name: t.name, source: t.source, description: t.description })),
      _debug: { cli_equivalent: 'htmd templates --json' }
    };
  }
});

// ---------- htmd_schema ----------
defineTool('htmd_schema', {
  description:
    'Return the JSON schema for a template. Maps 1:1 to `htmd schema <template>`. Use this ' +
    'to validate or generate well-formed data before calling htmd_render.',
  inputSchema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Template name.' }
    },
    required: ['template']
  },
  async handler(args) {
    const tpl = await loadTemplate(args.template);
    return {
      ok: true,
      template: args.template,
      schema: tpl.schema || {},
      _debug: { cli_equivalent: `htmd schema ${shq(args.template)}` }
    };
  }
});

export function listTools() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}

export function getTool(name) {
  return TOOLS[name];
}

export async function callTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) {
    const err = new Error(`Unknown tool: ${name}`);
    err.code = 'UNKNOWN_TOOL';
    throw err;
  }
  return await tool.handler(args || {});
}
