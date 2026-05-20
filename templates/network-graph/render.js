import { html, raw, escapeHtml } from '../../src/html-tag.js';

export default function render(data, h) {
  const nodes = (data.nodes || []).map((n, i) => ({
    id: String(n.id ?? `n${i + 1}`),
    label: n.label || String(n.id ?? `n${i + 1}`),
    kind: n.kind || 'default',
    size: typeof n.size === 'number' ? n.size : 1
  }));
  const idSet = new Set(nodes.map((n) => n.id));
  const edges = (data.edges || []).map((e) => ({
    source: String(e.source),
    target: String(e.target),
    label: e.label || '',
    kind: e.kind || 'default'
  })).filter((e) => idSet.has(e.source) && idSet.has(e.target));

  const W = 800;
  const H = 520;
  const positions = layout(nodes, edges, W, H);

  const kinds = Array.from(new Set(nodes.map((n) => n.kind)));
  const kindColors = assignColors(kinds);

  const legendItems = kinds.length > 1
    ? kinds.map((k) => ({ kind: k, color: kindColors[k] }))
    : [];

  return html`
    <main class="ng">
      <header class="ng-head">
        <h1 class="ng-title">${data.title || 'Network graph'}</h1>
        ${data.subtitle ? html`<p class="ng-subtitle">${data.subtitle}</p>` : ''}
        ${legendItems.length ? html`
          <ul class="ng-legend" aria-label="Legend">
            ${legendItems.map((it) => html`
              <li class="ng-legend-item">
                <span class="ng-legend-dot" style="background:${it.color}"></span>
                <span class="ng-legend-label">${it.kind}</span>
              </li>
            `)}
          </ul>
        ` : ''}
      </header>

      <div class="ng-canvas" role="img" aria-label="Network graph: ${nodes.length} nodes, ${edges.length} edges">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="ng-svg">
          <defs>
            <marker id="ng-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--htmd-muted)"/>
            </marker>
          </defs>
          <g class="ng-edges">
            ${edges.map((e) => edgeLine(e, positions))}
          </g>
          <g class="ng-nodes">
            ${nodes.map((n) => nodeCircle(n, positions, kindColors))}
          </g>
        </svg>
      </div>

      <details class="ng-table-wrap">
        <summary>Node and edge list (for screen readers)</summary>
        <table class="ng-table">
          <thead><tr><th>id</th><th>label</th><th>kind</th><th>connections</th></tr></thead>
          <tbody>
            ${nodes.map((n) => {
              const conns = edges.filter((e) => e.source === n.id || e.target === n.id).length;
              return html`<tr><td><code>${n.id}</code></td><td>${n.label}</td><td>${n.kind}</td><td>${conns}</td></tr>`;
            })}
          </tbody>
        </table>
      </details>
    </main>
  `;
}

function edgeLine(e, positions) {
  const a = positions[e.source];
  const b = positions[e.target];
  if (!a || !b) return '';
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return html`
    <g class="ng-edge ng-edge-${e.kind}">
      <line x1="${fix(a.x)}" y1="${fix(a.y)}" x2="${fix(b.x)}" y2="${fix(b.y)}" stroke="var(--htmd-border)" stroke-width="1.5"/>
      ${e.label ? html`<text x="${fix(mx)}" y="${fix(my - 4)}" class="ng-edge-label" text-anchor="middle">${e.label}</text>` : ''}
    </g>
  `;
}

function nodeCircle(n, positions, kindColors) {
  const p = positions[n.id];
  if (!p) return '';
  const r = 14 + Math.max(0, Math.min(20, (n.size - 1) * 6));
  const fill = kindColors[n.kind] || '#4f46e5';
  return html`
    <g class="ng-node ng-node-${n.kind}" transform="translate(${fix(p.x)} ${fix(p.y)})">
      <circle r="${r}" fill="${fill}" stroke="var(--htmd-bg)" stroke-width="2">
        <title>${escapeHtml(n.label)} (${escapeHtml(n.kind)})</title>
      </circle>
      <text class="ng-node-label" x="0" y="${r + 14}" text-anchor="middle">${n.label}</text>
    </g>
  `;
}

function fix(v) { return Math.round(v * 100) / 100; }

function assignColors(kinds) {
  const palette = ['#4f46e5', '#16a34a', '#dc2626', '#d97706', '#0284c7', '#7c3aed', '#db2777', '#059669', '#ea580c', '#0891b2'];
  const out = {};
  kinds.forEach((k, i) => { out[k] = palette[i % palette.length]; });
  return out;
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xffffffff) / 0x100000000;
  };
}

function layout(nodes, edges, W, H) {
  const N = nodes.length;
  const positions = {};
  if (N === 0) return positions;
  const rand = rng(N * 31 + edges.length);
  const cx = W / 2, cy = H / 2;
  const r0 = Math.min(W, H) * 0.3;
  nodes.forEach((n, i) => {
    const a = (i / N) * Math.PI * 2 + 0.5;
    positions[n.id] = {
      x: cx + Math.cos(a) * r0 + (rand() - 0.5) * 30,
      y: cy + Math.sin(a) * r0 + (rand() - 0.5) * 30,
      vx: 0, vy: 0
    };
  });
  if (N === 1) {
    positions[nodes[0].id].x = cx;
    positions[nodes[0].id].y = cy;
    return positions;
  }
  const k = Math.sqrt((W * H) / N) * 0.55;
  const iters = 220;
  for (let iter = 0; iter < iters; iter++) {
    const t = (1 - iter / iters) * (Math.min(W, H) * 0.05);
    for (let i = 0; i < N; i++) {
      const pa = positions[nodes[i].id];
      pa.vx = 0; pa.vy = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const pb = positions[nodes[j].id];
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (rand() - 0.5); dy = (rand() - 0.5); d2 = 0.01; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        pa.vx += (dx / d) * f;
        pa.vy += (dy / d) * f;
      }
    }
    for (const e of edges) {
      const pa = positions[e.source], pb = positions[e.target];
      if (!pa || !pb) continue;
      let dx = pa.x - pb.x, dy = pa.y - pb.y;
      let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d) / k;
      pa.vx -= (dx / d) * f;
      pa.vy -= (dy / d) * f;
      pb.vx += (dx / d) * f;
      pb.vy += (dy / d) * f;
    }
    for (const id in positions) {
      const p = positions[id];
      p.vx += (cx - p.x) * 0.01;
      p.vy += (cy - p.y) * 0.01;
      const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 0.01;
      const step = Math.min(mag, t);
      p.x += (p.vx / mag) * step;
      p.y += (p.vy / mag) * step;
      p.x = Math.max(40, Math.min(W - 40, p.x));
      p.y = Math.max(40, Math.min(H - 40, p.y));
    }
  }
  return positions;
}
