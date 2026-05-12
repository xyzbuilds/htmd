import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import { renderTemplate } from '../src/render.js';
import { extractState } from '../src/extract.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('extract: round-trips embedded state', () => {
  for (const name of ['feedback-corrector', 'kanban-board', 'checklist', 'q-and-a']) {
    it(`recovers ${name} state from rendered HTML`, async () => {
      const example = YAML.parse(readFileSync(join(ROOT, 'templates', name, 'example.yaml'), 'utf8'));
      const html = await renderTemplate(name, example);
      const states = extractState(html);
      const fc = states.find((s) => s.kind === name);
      expect(fc, `should find ${name} state`).toBeTruthy();
      expect(fc.state).toBeTypeOf('object');
    });
  }

  it('returns [] when there is no embedded state', () => {
    expect(extractState('<html><body>just text</body></html>')).toEqual([]);
  });

  it('still works on legacy markup that uses data-fc-state without data-htmd-state', () => {
    const html = `<script type="application/json" data-fc-state>${JSON.stringify({ items: [{ id: 'x' }] })}</script>`;
    const out = extractState(html);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('fc');
  });
});
