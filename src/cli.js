// CLI entry — commander setup.
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { exec } from 'node:child_process';
import YAML from 'yaml';
import { listTemplates, loadTemplate } from './templates.js';
import { renderTemplate, renderMarkdown } from './render.js';
import { htmlToMd } from './html2md.js';
import { mdToHtml } from './md.js';

const VERSION = '0.1.0';

export async function run(argv) {
  const program = new Command();
  program
    .name('htmd')
    .description('Token-cheap structured data → rich self-contained HTML for AI agents')
    .version(VERSION);

  program
    .command('templates')
    .description('list all available templates')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const list = await listTemplates();
      if (opts.json) {
        console.log(JSON.stringify(list.map((t) => ({ name: t.name, source: t.source, description: t.description })), null, 2));
        return;
      }
      const w = Math.max(...list.map((t) => t.name.length));
      for (const t of list) {
        const tag = t.source === 'builtin' ? '' : ` (${t.source})`;
        console.log(`  ${t.name.padEnd(w)}  ${t.description}${tag}`);
      }
    });

  program
    .command('schema <template>')
    .description('print JSON schema for a template')
    .action(async (name) => {
      const tpl = await loadTemplate(name);
      console.log(JSON.stringify(tpl.schema || {}, null, 2));
    });

  program
    .command('render <template>')
    .description('render a template with data')
    .option('-d, --data <file>', 'data file (.yaml, .yml, or .json). Use "-" for stdin')
    .option('--inline <json>', 'inline JSON data')
    .option('-o, --out <file>', 'output file (default: stdout)')
    .option('--no-validate', 'skip schema validation')
    .option('--json', 'emit JSON envelope (for scripting): { ok, html, errors }')
    .action(async (name, opts) => {
      let data;
      try {
        if (opts.inline) {
          data = JSON.parse(opts.inline);
        } else if (opts.data) {
          data = await readData(opts.data);
        } else {
          // try to default to template's example
          const tpl = await loadTemplate(name);
          const examplePath = resolve(tpl.dir, 'example.yaml');
          if (existsSync(examplePath)) {
            data = YAML.parse(readFileSync(examplePath, 'utf8'));
            console.error(`(no --data given; using template example.yaml)`);
          } else {
            throw new Error('No data source. Provide --data <file> or --inline <json>.');
          }
        }
        const html = await renderTemplate(name, data, { validate: opts.validate });
        if (opts.json) {
          process.stdout.write(JSON.stringify({ ok: true, html }));
          return;
        }
        await writeOutput(html, opts.out);
      } catch (e) {
        if (opts.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: e.message, errors: e.errors || null }));
          process.exit(1);
        }
        console.error(`htmd: ${e.message}`);
        process.exit(1);
      }
    });

  program
    .command('md2html [file]')
    .description('plain markdown → styled HTML (uses default theme, no template)')
    .option('-o, --out <file>', 'output file')
    .option('-t, --title <title>', 'page title')
    .action(async (file, opts) => {
      const md = await readTextOrStdin(file);
      const html = renderMarkdown(md, { title: opts.title });
      await writeOutput(html, opts.out);
    });

  program
    .command('html2md [file]')
    .description('HTML → Markdown (token-saver for input)')
    .option('-o, --out <file>', 'output file')
    .action(async (file, opts) => {
      const html = await readTextOrStdin(file);
      const md = htmlToMd(html);
      await writeOutput(md, opts.out);
    });

  program
    .command('preview <file>')
    .description('open an HTML file in the default browser (best-effort)')
    .action(async (file) => {
      const path = resolve(file);
      if (!existsSync(path)) {
        console.error(`htmd: file not found: ${path}`);
        process.exit(1);
      }
      const cmd = process.platform === 'darwin' ? `open "${path}"` :
                  process.platform === 'win32' ? `start "" "${path}"` :
                  `xdg-open "${path}"`;
      exec(cmd, (err) => {
        if (err) console.error(`htmd: failed to open: ${err.message}`);
      });
    });

  program
    .command('init-template <name>')
    .description('scaffold a new template directory')
    .option('--dir <path>', 'parent directory (default: ./templates)')
    .action(async (name, opts) => {
      const parent = resolve(opts.dir || './templates');
      const dir = resolve(parent, name);
      if (existsSync(dir)) {
        console.error(`htmd: directory already exists: ${dir}`);
        process.exit(1);
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'render.js'), TEMPLATE_RENDER_STUB);
      writeFileSync(resolve(dir, 'schema.json'), TEMPLATE_SCHEMA_STUB);
      writeFileSync(resolve(dir, 'style.css'), TEMPLATE_STYLE_STUB);
      writeFileSync(resolve(dir, 'description.md'), `# ${name}\n\nShort description of this template.\n`);
      writeFileSync(resolve(dir, 'example.yaml'), `title: Example\nbody: Replace with sample data.\n`);
      console.log(`Scaffolded template: ${dir}`);
    });

  await program.parseAsync(argv);
}

async function readData(file) {
  const txt = await readTextOrStdin(file);
  if (file !== '-' && (file.endsWith('.json'))) return JSON.parse(txt);
  // Default: parse as YAML (handles JSON as a subset).
  return YAML.parse(txt);
}

async function readTextOrStdin(file) {
  if (!file || file === '-') return await readStdin();
  return readFileSync(resolve(file), 'utf8');
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function writeOutput(text, out) {
  if (!out) {
    process.stdout.write(text);
    if (!text.endsWith('\n')) process.stdout.write('\n');
    return;
  }
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.error(`htmd: wrote ${path}`);
}

const TEMPLATE_RENDER_STUB = `import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  return html\`
    <main class="my-template">
      <h1>\${data.title}</h1>
      <p>\${data.body}</p>
    </main>
  \`;
}
`;

const TEMPLATE_SCHEMA_STUB = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["title"],
  "properties": {
    "title": { "type": "string" },
    "body": { "type": "string" }
  }
}
`;

const TEMPLATE_STYLE_STUB = `.my-template {
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1.25rem;
}
.my-template h1 {
  letter-spacing: -0.02em;
}
`;
