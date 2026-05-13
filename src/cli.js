// CLI entry — commander setup.
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { exec } from 'node:child_process';
import YAML from 'yaml';
import { listTemplates, loadTemplate } from './templates.js';
import { renderTemplate, renderMarkdown } from './render.js';
import { composeFromMarkdown } from './compose.js';
import { detectTemplates } from './detect.js';
import { extractState } from './extract.js';
import { htmlToMd } from './html2md.js';
import { mdToHtml } from './md.js';
import { startServer, defaultRenderDir } from './serve.js';
import { publishRender, publicHost, cleanupOldRenders } from './serve-helpers.js';
import { normalize as normalizeInput } from './normalize.js';
import { route as routeMessage, applyDecision } from './route.js';
import { loadConfig } from './config.js';
import { getTransport, listTransports, hasTransport } from './transports/index.js';
import { renderMarkdown as renderMd } from './render.js';

const VERSION = '0.5.0-alpha.0';

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
    .option('--serve', 'publish to the local htmd serve dir and print the Tailscale URL')
    .option('--serve-dir <dir>', `serve dir (default: ${defaultRenderDir()})`)
    .option('--serve-host <host>', 'public host for the URL (overrides HTMD_PUBLIC_HOST/HTMD_TAILSCALE_IP)')
    .option('--ttl-days <n>', 'auto-prune renders older than N days when --serve is used', '7')
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
        if (opts.serve) {
          await runServePublish({ html, slug: data?.title || name, opts });
          return;
        }
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
    .command('compose [file]')
    .description('render a markdown file with embedded ```htmd:<template>``` fences into one HTML page')
    .option('-o, --out <file>', 'output file (default: stdout)')
    .option('-t, --title <title>', 'page title (default: first H1)')
    .option('--no-validate', 'skip schema validation per block')
    .option('--json', 'emit JSON envelope: { ok, html, errors, blocks }')
    .option('--serve', 'publish to the local htmd serve dir and print the Tailscale URL')
    .option('--serve-dir <dir>', `serve dir (default: ${defaultRenderDir()})`)
    .option('--serve-host <host>', 'public host for the URL (overrides HTMD_PUBLIC_HOST/HTMD_TAILSCALE_IP)')
    .option('--ttl-days <n>', 'auto-prune renders older than N days when --serve is used', '7')
    .action(async (file, opts) => {
      try {
        const md = await readTextOrStdin(file);
        const result = await composeFromMarkdown(md, { title: opts.title, validate: opts.validate });
        if (opts.serve) {
          if (result.errors.length) {
            for (const e of result.errors) {
              console.error(`htmd compose: block #${e.idx} (${e.template}): ${e.error}`);
            }
          }
          await runServePublish({ html: result.html, slug: opts.title || file || 'compose', opts });
          return;
        }
        if (opts.json) {
          process.stdout.write(JSON.stringify(result));
          return;
        }
        if (result.errors.length) {
          for (const e of result.errors) {
            console.error(`htmd compose: block #${e.idx} (${e.template}): ${e.error}`);
          }
        }
        await writeOutput(result.html, opts.out);
      } catch (e) {
        if (opts.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
          process.exit(1);
        }
        console.error(`htmd: ${e.message}`);
        process.exit(1);
      }
    });

  program
    .command('detect [file]')
    .description('scan a plain markdown file and suggest htmd templates per region')
    .option('--json', 'output as JSON (default: human-readable)')
    .option('--min-confidence <n>', 'minimum confidence (0-1)', '0.45')
    .action(async (file, opts) => {
      const md = await readTextOrStdin(file);
      const min = parseFloat(opts.minConfidence);
      const suggestions = detectTemplates(md).filter((s) => s.confidence >= min);
      if (opts.json) {
        process.stdout.write(JSON.stringify(suggestions, null, 2));
        process.stdout.write('\n');
        return;
      }
      if (suggestions.length === 0) {
        console.log('(no template suggestions above confidence threshold)');
        return;
      }
      for (const s of suggestions) {
        const conf = (s.confidence * 100).toFixed(0) + '%';
        console.log(`L${s.line_start}-${s.line_end} → ${s.template} (${conf}) — ${s.reason}`);
      }
    });

  program
    .command('extract [file]')
    .description('read a rendered HTML file and emit the embedded state (kanban moves, feedback corrections, etc.) as YAML')
    .option('--json', 'emit JSON instead of YAML')
    .option('-o, --out <file>', 'output file')
    .action(async (file, opts) => {
      const html = await readTextOrStdin(file);
      const states = extractState(html);
      const text = opts.json
        ? JSON.stringify(states, null, 2)
        : YAML.stringify(states);
      await writeOutput(text, opts.out);
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
    .command('serve')
    .description('serve rendered htmd pages over HTTP and accept /submit POSTs back to the agent')
    .option('-p, --port <port>', 'port to listen on', '8787')
    .option('-b, --bind <addr>', 'bind address', '0.0.0.0')
    .option('-d, --dir <path>', `renders dir (default: ${defaultRenderDir()})`)
    .option('--token <secret>', 'require X-HTMD-Token header on /submit/* (otherwise open)')
    .option('--mode <mode>', 'submit mode: dryrun|telegram|openclaw-ssh|openclaw|file (overrides HTMD_SUBMIT_MODE)')
    .option('--log <path>', 'log file path (default: ~/.htmd/serve.log)')
    .option('--tailscale-ip <ip>', 'tailscale IP for banner (default: HTMD_TAILSCALE_IP env or 100.70.189.117)')
    .action(async (opts) => {
      const tailscaleIp = opts.tailscaleIp || process.env.HTMD_TAILSCALE_IP || '100.70.189.117';
      const mode = (opts.mode || process.env.HTMD_SUBMIT_MODE || 'dryrun').toLowerCase();
      startServer({
        port: opts.port,
        bind: opts.bind,
        dir: opts.dir,
        token: opts.token,
        mode,
        logPath: opts.log,
        tailscaleIp,
        version: VERSION,
        onReady: ({ port, dir }) => {
          console.log(`htmd serve listening on http://${opts.bind}:${port}`);
          console.log(`  • Tailscale URL: http://${tailscaleIp}:${port}`);
          const miniBase = process.env.HTMD_MINI_APP_BASE;
          if (miniBase) {
            console.log(`  • Mini App base: ${miniBase.replace(/\/+$/, '')}`);
          }
          console.log(`  • Render dir:    ${dir}`);
          console.log(`  • Auth:          ${opts.token ? 'token-protected' : 'open'}`);
          console.log(`  • Submit hook:   ${mode}`);
        }
      });
    });

  program
    .command('button')
    .description('emit a Telegram chat-message JSON envelope with an inline-keyboard web_app button')
    .requiredOption('--url <url>', 'web_app URL the button opens (use the HTMD_MINI_APP_BASE URL)')
    .option('--text <label>', 'button label', 'Open in Telegram')
    .option('--message <text>', 'message body shown above the button', 'Tap to open the interactive page.')
    .option('--chat-id <id>', 'Telegram chat id to fill in (otherwise left as placeholder)')
    .option('--reply-to <msg-id>', 'reply_to_message_id (optional)')
    .action((opts) => {
      const envelope = {
        chat_id: opts.chatId || '<set at delivery time>',
        text: opts.message,
        reply_markup: {
          inline_keyboard: [[
            { text: opts.text, web_app: { url: opts.url } }
          ]]
        }
      };
      if (opts.replyTo) envelope.reply_to_message_id = Number(opts.replyTo);
      process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
    });

  program
    .command('normalize [file]')
    .description('canonicalize an agent message (Markdown / Telegram-HTML / plain) to CommonMark')
    .option('--hint <format>', 'force input format: markdown | telegram-html | plain')
    .option('--json', 'emit JSON envelope: { markdown, format, chars }')
    .action(async (file, opts) => {
      const input = await readTextOrStdin(file);
      const out = normalizeInput(input, { hint: opts.hint });
      if (opts.json) {
        process.stdout.write(JSON.stringify(out));
        return;
      }
      process.stdout.write(out.markdown);
      if (!out.markdown.endsWith('\n')) process.stdout.write('\n');
    });

  program
    .command('route [file]')
    .description('decide whether an agent reply should go inline or as an htmd page')
    .option('--input <file>', 'input file (alias for the positional argument)')
    .option('--length-threshold <n>', 'override config lengthThreshold (default: 1500)')
    .option('--fenced-min-lines <n>', 'override config fencedBlockMinLines (default: 10)')
    .option('--needs-approval', 'force routing to a page with an approval control')
    .option('--prefer-inline', 'force inline regardless of length/structure')
    .option('--prefer-page', 'force a page regardless of length/structure')
    .option('--render', 'when action=page, publish via --transport and include rendered.{id,url,submitEndpoint}')
    .option('--transport <name>', `transport name (default from config; available: ${listTransports().join(', ')})`)
    .option('--slug <slug>', 'slug for the published page (default: derived from input)')
    .option('--meta <json>', 'JSON object of meta fields passed to the transport')
    .action(async (file, opts) => {
      try {
        const input = await readTextOrStdin(opts.input || file);
        const { config } = loadConfig();
        const norm = normalizeInput(input);
        const decision = routeMessage(norm.markdown, {
          config,
          alreadyNormalized: true,
          lengthThreshold: opts.lengthThreshold ? Number(opts.lengthThreshold) : undefined,
          fencedBlockMinLines: opts.fencedMinLines ? Number(opts.fencedMinLines) : undefined,
          needsApproval: !!opts.needsApproval,
          preferInline: !!opts.preferInline,
          preferPage: !!opts.preferPage
        });
        // Carry the detected input format through (decision.input.format
        // reflects the input as seen by `route()`, which we forced to
        // 'markdown' via alreadyNormalized; rewrite it for the caller).
        decision.input.format = norm.format;
        decision.input.chars = norm.chars;

        if (!opts.render || decision.action === 'inline') {
          process.stdout.write(JSON.stringify(decision));
          return;
        }

        const transportName = opts.transport || config.routing.defaultTransport;
        if (!hasTransport(transportName)) {
          decision.action = 'inline';
          decision.reason = 'transport-failure';
          decision.error = `unknown transport "${transportName}"`;
          decision.inlinePrefix = `(htmd page failed: unknown transport "${transportName}")`;
          decision.inlineBody = norm.markdown;
          process.stdout.write(JSON.stringify(decision));
          return;
        }
        const transport = getTransport(transportName);
        const meta = opts.meta ? safeJson(opts.meta) : {};
        const slug = opts.slug || deriveSlug(norm.markdown);

        const finalDecision = await applyDecision(decision, norm.markdown, transport, {
          slug,
          meta,
          renderer: (md) => renderMd(md, { title: slug })
        });
        process.stdout.write(JSON.stringify(finalDecision));
      } catch (e) {
        process.stdout.write(JSON.stringify({ action: 'inline', reason: 'transport-failure', error: e.message }));
        process.exit(1);
      }
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

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

function deriveSlug(md) {
  if (!md) return 'reply';
  const firstH1 = /^#\s+(.+)$/m.exec(md);
  if (firstH1) return firstH1[1].trim().slice(0, 60);
  const firstLine = String(md).split('\n').find((l) => l.trim().length);
  return (firstLine || 'reply').trim().slice(0, 60);
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

// Publish a rendered HTML page into the serve dir and print the public URL.
async function runServePublish({ html, slug, opts }) {
  const dir = opts.serveDir || defaultRenderDir();
  const host = publicHost({ host: opts.serveHost });
  const ttl = Number(opts.ttlDays || 7);
  const pruned = cleanupOldRenders(dir, ttl);
  const { id, file, viewUrl, submitUrl } = publishRender({ html, slug, dir, host });
  console.log(viewUrl);
  // h2: If HTMD_MINI_APP_BASE is set (e.g. the public HTTPS Funnel hostname),
  // also print a Mini-App-friendly URL. The base maps to the same render id
  // and is what an inline-keyboard web_app button should point at.
  const miniBase = (process.env.HTMD_MINI_APP_BASE || '').replace(/\/+$/, '');
  if (miniBase) {
    console.log(`${miniBase}/r/${id}`);
  }
  console.error(`htmd: wrote ${file}`);
  console.error(`htmd: submit endpoint: ${submitUrl}`);
  if (miniBase) console.error(`htmd: mini-app URL:    ${miniBase}/r/${id}`);
  if (pruned > 0) console.error(`htmd: pruned ${pruned} render(s) older than ${ttl} day(s)`);
  // Best-effort: hit /health to confirm the serve daemon is up.
  await pingHealth(host).catch(() => {
    console.error(`htmd: warning — htmd serve does not appear to be running at ${host}. Start it with: htmd serve`);
  });
}

function pingHealth(host) {
  return new Promise((res, rej) => {
    try {
      const u = new URL(host + '/health');
      const lib = u.protocol === 'https:' ? import('node:https') : import('node:http');
      lib.then((mod) => {
        const req = mod.request({
          method: 'GET',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: '/health',
          timeout: 1500
        }, (r) => {
          if (r.statusCode === 200) res(true);
          else rej(new Error('HTTP ' + r.statusCode));
          r.resume();
        });
        req.on('error', rej);
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.end();
      }).catch(rej);
    } catch (e) { rej(e); }
  });
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
