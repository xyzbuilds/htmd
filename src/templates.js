// Template registry: built-in templates + auto-discovered plugins.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'templates');

const BUILTIN_NAMES = [
  'status-report',
  'dashboard',
  'decision-matrix',
  'comparison-3-up',
  'email-digest',
  'slide-deck',
  'prompt-tuner',
  'kanban-board',
  'concept-explainer',
  'feedback-corrector'
];

const _cache = new Map();

export async function listTemplates() {
  const out = [];
  for (const name of BUILTIN_NAMES) {
    const dir = join(TEMPLATES_DIR, name);
    if (!existsSync(dir)) continue;
    out.push({
      name,
      source: 'builtin',
      dir,
      description: readDescription(dir)
    });
  }
  for (const plugin of discoverPlugins()) {
    out.push(plugin);
  }
  return out;
}

export async function loadTemplate(name) {
  if (_cache.has(name)) return _cache.get(name);
  const all = await listTemplates();
  const found = all.find((t) => t.name === name);
  if (!found) {
    throw new Error(
      `Template not found: "${name}". Available: ${all.map((t) => t.name).join(', ')}`
    );
  }
  const renderUrl = pathToFileURL(join(found.dir, 'render.js')).href;
  const mod = await import(renderUrl);
  const render = mod.default || mod.render;
  if (typeof render !== 'function') {
    throw new Error(`Template "${name}" render.js must export a default function`);
  }
  const schemaPath = join(found.dir, 'schema.json');
  const schema = existsSync(schemaPath)
    ? JSON.parse(readFileSync(schemaPath, 'utf8'))
    : null;
  const cssPath = join(found.dir, 'style.css');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
  const jsPath = join(found.dir, 'script.js');
  const js = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';
  const tpl = {
    ...found,
    render,
    schema,
    css,
    js
  };
  _cache.set(name, tpl);
  return tpl;
}

function readDescription(dir) {
  const path = join(dir, 'description.md');
  if (!existsSync(path)) return '';
  const txt = readFileSync(path, 'utf8').trim();
  // First non-heading line as short description.
  const lines = txt.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return lines[0] || '';
}

function discoverPlugins() {
  const out = [];
  // Look for installed npm packages with keyword "htmd-template"
  const require = createRequire(import.meta.url);
  let nodeModules;
  try {
    nodeModules = resolve(ROOT, 'node_modules');
    if (!existsSync(nodeModules)) return out;
  } catch {
    return out;
  }
  let entries;
  try {
    entries = readdirSync(nodeModules);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.startsWith('htmd-template-')) continue;
    try {
      const pkgPath = resolve(nodeModules, entry, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const keywords = pkg.keywords || [];
      if (!keywords.includes('htmd-template')) continue;
      const name = pkg.htmd?.name || entry.replace(/^htmd-template-/, '');
      const dir = resolve(nodeModules, entry);
      out.push({
        name,
        source: 'plugin:' + entry,
        dir,
        description: pkg.description || ''
      });
    } catch {
      // skip broken plugin
    }
  }
  return out;
}

export function templateRoot() {
  return TEMPLATES_DIR;
}

export function projectRoot() {
  return ROOT;
}
