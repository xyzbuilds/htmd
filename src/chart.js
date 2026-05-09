// Inline-SVG chart helpers — sparkline, bar, line, donut.
// All return SVG strings sized for inline use. Zero deps.
// Colors come from CSS custom properties so themes can override.

import { raw } from './html-tag.js';

const DEFAULTS = {
  stroke: 'var(--htmd-accent, #4f46e5)',
  fill: 'var(--htmd-accent-soft, rgba(79,70,229,0.15))',
  axis: 'var(--htmd-muted, #94a3b8)',
  text: 'var(--htmd-fg, #0f172a)',
  bg: 'var(--htmd-surface, #ffffff)'
};

function sanitizeNums(arr) {
  return (arr || []).map((v) => (typeof v === 'number' && isFinite(v) ? v : 0));
}

export function sparkline(values, opts = {}) {
  const data = sanitizeNums(values);
  if (data.length === 0) return raw('');
  const w = opts.width || 120;
  const h = opts.height || 32;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const areaD =
    `${d} L${points[points.length - 1][0].toFixed(2)},${h - pad} L${points[0][0].toFixed(2)},${h - pad} Z`;
  const stroke = opts.stroke || DEFAULTS.stroke;
  const fill = opts.fill || DEFAULTS.fill;
  return raw(
    `<svg class="htmd-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">` +
      `<path d="${areaD}" fill="${fill}" stroke="none"/>` +
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` +
      `</svg>`
  );
}

export function bar(items, opts = {}) {
  // items: [{label, value, color?}]
  const data = (items || []).map((it) => ({
    label: it.label ?? '',
    value: typeof it.value === 'number' && isFinite(it.value) ? it.value : 0,
    color: it.color
  }));
  if (data.length === 0) return raw('');
  const w = opts.width || 480;
  const h = opts.height || 220;
  const padL = opts.padLeft ?? 90;
  const padR = 16;
  const padT = 12;
  const padB = 24;
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const rowH = (h - padT - padB) / data.length;
  const barH = Math.max(4, rowH * 0.6);
  const innerW = w - padL - padR;
  const stroke = opts.stroke || DEFAULTS.stroke;
  let out = `<svg class="htmd-bar" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">`;
  data.forEach((d, i) => {
    const y = padT + i * rowH + (rowH - barH) / 2;
    const bw = (d.value / max) * innerW;
    const color = d.color || stroke;
    out += `<text x="${padL - 6}" y="${y + barH / 2}" font-size="11" text-anchor="end" dominant-baseline="middle" fill="${DEFAULTS.text}">${escapeSvg(d.label)}</text>`;
    out += `<rect x="${padL}" y="${y}" width="${bw}" height="${barH}" rx="3" fill="${color}"/>`;
    out += `<text x="${padL + bw + 4}" y="${y + barH / 2}" font-size="11" dominant-baseline="middle" fill="${DEFAULTS.text}">${escapeSvg(formatNum(d.value))}</text>`;
  });
  out += `</svg>`;
  return raw(out);
}

export function line(series, opts = {}) {
  // series: [{name, values: [number]}], or just an array of numbers (single series)
  let normSeries;
  if (Array.isArray(series) && typeof series[0] === 'number') {
    normSeries = [{ name: '', values: series }];
  } else {
    normSeries = (series || []).map((s) => ({ name: s.name || '', values: sanitizeNums(s.values) }));
  }
  if (normSeries.length === 0 || normSeries[0].values.length === 0) return raw('');
  const w = opts.width || 480;
  const h = opts.height || 220;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const allVals = normSeries.flatMap((s) => s.values);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const len = Math.max(...normSeries.map((s) => s.values.length));
  const stepX = (w - padL - padR) / Math.max(1, len - 1);
  const colors = ['var(--htmd-accent, #4f46e5)', '#10b981', '#f59e0b', '#ef4444'];
  let out = `<svg class="htmd-line" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">`;
  // axes
  out += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="${DEFAULTS.axis}" stroke-width="0.5"/>`;
  out += `<line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="${DEFAULTS.axis}" stroke-width="0.5"/>`;
  // y labels (min/max)
  out += `<text x="${padL - 4}" y="${padT + 4}" font-size="10" text-anchor="end" fill="${DEFAULTS.text}" opacity="0.7">${formatNum(max)}</text>`;
  out += `<text x="${padL - 4}" y="${h - padB}" font-size="10" text-anchor="end" fill="${DEFAULTS.text}" opacity="0.7">${formatNum(min)}</text>`;
  normSeries.forEach((s, idx) => {
    const color = colors[idx % colors.length];
    const points = s.values.map((v, i) => {
      const x = padL + i * stepX;
      const y = padT + (1 - (v - min) / range) * (h - padT - padB);
      return [x, y];
    });
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    points.forEach((p) => {
      out += `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="2.5" fill="${color}"/>`;
    });
  });
  // legend
  if (normSeries.length > 1 || normSeries[0].name) {
    let lx = padL;
    normSeries.forEach((s, idx) => {
      const color = colors[idx % colors.length];
      out += `<rect x="${lx}" y="${h - 12}" width="8" height="8" fill="${color}"/>`;
      out += `<text x="${lx + 12}" y="${h - 5}" font-size="10" fill="${DEFAULTS.text}">${escapeSvg(s.name)}</text>`;
      lx += 12 + s.name.length * 6 + 12;
    });
  }
  out += `</svg>`;
  return raw(out);
}

export function donut(slices, opts = {}) {
  // slices: [{label, value, color?}]
  const data = (slices || []).filter((s) => typeof s.value === 'number' && s.value > 0);
  if (data.length === 0) return raw('');
  const total = data.reduce((a, b) => a + b.value, 0);
  const size = opts.size || 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const inner = r * 0.62;
  const colors = opts.colors || ['var(--htmd-accent, #4f46e5)', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  let angle = -Math.PI / 2;
  let out = `<svg class="htmd-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`;
  data.forEach((s, i) => {
    const slice = (s.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + slice;
    angle = a1;
    const large = slice > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const xi1 = cx + inner * Math.cos(a1);
    const yi1 = cy + inner * Math.sin(a1);
    const xi0 = cx + inner * Math.cos(a0);
    const yi0 = cy + inner * Math.sin(a0);
    const color = s.color || colors[i % colors.length];
    const d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${inner},${inner} 0 ${large} 0 ${xi0},${yi0} Z`;
    out += `<path d="${d}" fill="${color}"><title>${escapeSvg(s.label)}: ${escapeSvg(formatNum(s.value))}</title></path>`;
  });
  if (opts.centerLabel) {
    out += `<text x="${cx}" y="${cy}" font-size="14" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${DEFAULTS.text}">${escapeSvg(opts.centerLabel)}</text>`;
  }
  out += `</svg>`;
  return raw(out);
}

function escapeSvg(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function formatNum(n) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}
