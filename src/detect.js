// detect.js — heuristic scanner that suggests which htmd template would
// best render each region of a plain markdown file.
//
// Output shape per suggestion:
//   {
//     template: 'status-report',
//     confidence: 0.82,
//     line_start: 5,
//     line_end: 28,
//     reason: 'Found "Shipped" / "In Progress" / "Blocked" sections',
//     sample_data_yaml: 'title: ...\nsections: ...'
//   }
//
// The point: an agent reading a user's markdown can call `htmd detect` to
// find the spots that would benefit from being rendered as widgets, then
// emit a compose-style markdown that swaps those regions for ```htmd:* fences.
//
// Heuristics are intentionally pragmatic, not perfect. Confidence is a
// rough self-rating to let callers threshold.

import { marked } from 'marked';
import YAML from 'yaml';

const DETECTORS = [
  detectStatusReport,
  detectKanbanBoard,
  detectDecisionMatrix,
  detectComparison3Up,
  detectChecklist,
  detectFeedbackCorrector,
  detectQAndA,
  detectEmailDigest,
  detectDataTable,
  detectSlideDeck,
  detectApprovalList,
  detectRankOrder,
  detectDashboard
];

export function detectTemplates(mdText) {
  const tokens = withLineNumbers(marked.lexer(mdText));
  const suggestions = [];
  for (const detector of DETECTORS) {
    try {
      const found = detector(tokens, mdText);
      if (Array.isArray(found)) suggestions.push(...found);
      else if (found) suggestions.push(found);
    } catch {
      // a broken detector should not break the whole scan
    }
  }
  // De-duplicate overlapping suggestions: keep highest-confidence per range.
  suggestions.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const s of suggestions) {
    if (!kept.some((k) => overlaps(k, s))) kept.push(s);
  }
  // Sort final output by document order.
  kept.sort((a, b) => a.line_start - b.line_start);
  return kept;
}

function overlaps(a, b) {
  return !(a.line_end < b.line_start || b.line_end < a.line_start);
}

// Annotate marked tokens with line numbers (lexer doesn't include them).
function withLineNumbers(tokens) {
  let line = 1;
  for (const tok of tokens) {
    tok._line_start = line;
    const lines = (tok.raw || '').split('\n').length;
    line += lines - (tok.raw && tok.raw.endsWith('\n') ? 0 : 0);
    if (tok.raw && tok.raw.endsWith('\n')) {
      // raw includes trailing newline; advance accordingly already done above
    }
    tok._line_end = line - 1;
    if (tok.raw && !tok.raw.endsWith('\n')) {
      // adjust: this token sits on lines start..start+lines-1
      tok._line_end = tok._line_start + lines - 1;
    }
  }
  return tokens;
}

// ---------------- detectors ----------------

const STATUS_HEADINGS = [
  /shipped/i,
  /in progress|in_progress/i,
  /blocked/i,
  /next/i,
  /done/i,
  /to ?do|todo/i
];

function detectStatusReport(tokens) {
  const headings = tokens.filter((t) => t.type === 'heading' && t.depth >= 2);
  const matches = headings.filter((h) => STATUS_HEADINGS.some((re) => re.test(h.text)));
  if (matches.length < 2) return null;
  const start = matches[0]._line_start;
  const end = matches[matches.length - 1]._line_end;
  // Build sample
  const sections = {};
  for (const h of matches) {
    const key = h.text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
    const idx = tokens.indexOf(h);
    const next = tokens[idx + 1];
    const items = [];
    if (next && (next.type === 'list' || next.type === 'paragraph')) {
      const list = next.type === 'list' ? next.items : [{ text: next.text }];
      for (const li of list) items.push({ title: (li.text || '').split('\n')[0].slice(0, 120) });
    }
    if (items.length) sections[key] = items;
  }
  const sample = { title: firstHeadingText(tokens) || 'Status', sections };
  return {
    template: 'status-report',
    confidence: matches.length >= 3 ? 0.85 : 0.65,
    line_start: start,
    line_end: end,
    reason: `Found status-style headings: ${matches.map((m) => m.text).join(', ')}`,
    sample_data_yaml: YAML.stringify(sample).trim()
  };
}

const KANBAN_HEADINGS = [/^backlog$/i, /^to[- ]?do$/i, /^doing$/i, /^in progress$/i, /^done$/i, /^review$/i, /^blocked$/i];

function detectKanbanBoard(tokens) {
  const headings = tokens.filter((t) => t.type === 'heading' && t.depth === 2);
  const matches = headings.filter((h) => KANBAN_HEADINGS.some((re) => re.test(h.text.trim())));
  if (matches.length < 3) return null;
  const start = matches[0]._line_start;
  const end = matches[matches.length - 1]._line_end;
  const columns = matches.map((h) => {
    const idx = tokens.indexOf(h);
    const next = tokens[idx + 1];
    const cards = [];
    if (next && next.type === 'list') {
      for (const li of next.items) cards.push({ title: (li.text || '').split('\n')[0] });
    }
    return { name: h.text, cards };
  });
  return {
    template: 'kanban-board',
    confidence: 0.78,
    line_start: start,
    line_end: end,
    reason: `Found kanban-style sibling H2s: ${matches.map((m) => m.text).join(', ')}`,
    sample_data_yaml: YAML.stringify({ title: firstHeadingText(tokens) || 'Board', columns }).trim()
  };
}

function detectDecisionMatrix(tokens) {
  const tables = tokens.filter((t) => t.type === 'table');
  for (const t of tables) {
    const headers = t.header.map((c) => (c.text || '').toLowerCase());
    const looksScored =
      headers.some((h) => /weight|score|rating|criteria|criterion/.test(h)) ||
      (headers.length >= 4 && headers.slice(1).every((h) => /^[\d.]+$|^score|^weight|^pro|^con/.test(h) || h.length < 18));
    if (!looksScored) continue;
    const start = t._line_start;
    const end = t._line_end;
    return {
      template: 'decision-matrix',
      confidence: 0.7,
      line_start: start,
      line_end: end,
      reason: `Table headers look like scored criteria: [${headers.join(', ')}]`,
      sample_data_yaml: YAML.stringify(scoredTableToMatrix(t)).trim()
    };
  }
  return null;
}

function scoredTableToMatrix(table) {
  const headers = table.header.map((c) => c.text);
  const criteriaHeaders = headers.slice(1);
  const criteria = criteriaHeaders.map((name) => ({ name, weight: 1 }));
  const options = table.rows.map((row) => {
    const optName = row[0]?.text || 'Option';
    const scores = {};
    criteriaHeaders.forEach((name, i) => {
      const cell = row[i + 1]?.text || '';
      const num = parseFloat(cell);
      scores[name] = isFinite(num) ? num : cell;
    });
    return { name: optName, scores };
  });
  return { question: 'Which option?', criteria, options };
}

function detectComparison3Up(tokens) {
  // Look for sequence of H2 headings with similar siblings ("Option A", "Option B", "Option C")
  const headings = tokens.filter((t) => t.type === 'heading' && t.depth === 2);
  if (headings.length < 2 || headings.length > 5) return null;
  const labels = headings.map((h) => h.text.toLowerCase());
  const looksLikeOptions =
    labels.every((l) => /^option |^approach |^plan |^candidate |^variant /.test(l)) ||
    labels.every((l) => /^[A-Za-z]\.?\s/.test(l));
  if (!looksLikeOptions) return null;
  const start = headings[0]._line_start;
  const end = headings[headings.length - 1]._line_end;
  return {
    template: 'comparison-3-up',
    confidence: 0.6,
    line_start: start,
    line_end: end,
    reason: `Sibling H2s look like options: ${headings.map((h) => h.text).join(', ')}`,
    sample_data_yaml: YAML.stringify({
      title: firstHeadingText(tokens) || 'Comparison',
      options: headings.map((h) => ({ name: h.text, summary: '', pros: [], cons: [], verdict: '' }))
    }).trim()
  };
}

function detectChecklist(tokens) {
  const lists = tokens.filter((t) => t.type === 'list');
  for (const l of lists) {
    const taskItems = l.items.filter((i) => i.task === true || /^\[ ?[xX ]?\]/.test((i.text || '').trim()));
    if (taskItems.length >= 3) {
      return {
        template: 'checklist',
        confidence: 0.82,
        line_start: l._line_start,
        line_end: l._line_end,
        reason: `Found GFM task list with ${taskItems.length} items`,
        sample_data_yaml: YAML.stringify({
          title: firstHeadingText(tokens) || 'Tasks',
          items: l.items.map((i, idx) => ({
            id: 't' + (idx + 1),
            title: (i.text || '').replace(/^\[ ?[xX ]?\]\s*/, '').split('\n')[0],
            done: !!i.checked
          }))
        }).trim()
      };
    }
  }
  return null;
}

function detectFeedbackCorrector(tokens) {
  // Look for a list where each item has a label-looking suffix or prefix like [URGENT] or (NOISE)
  const lists = tokens.filter((t) => t.type === 'list');
  for (const l of lists) {
    let labeled = 0;
    const labelSet = new Set();
    for (const it of l.items) {
      const m = /\b(URGENT|USEFUL|NOISE|SPAM|HIGH|MEDIUM|LOW|YES|NO|MAYBE|APPROVED|REJECTED)\b/.exec((it.text || '').toUpperCase());
      if (m) {
        labeled++;
        labelSet.add(m[1]);
      }
    }
    if (labeled >= 3 && labelSet.size >= 2) {
      const labels = [...labelSet].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }));
      return {
        template: 'feedback-corrector',
        confidence: 0.7,
        line_start: l._line_start,
        line_end: l._line_end,
        reason: `Found ${labeled} items with labels (${[...labelSet].join(', ')}) — looks like a classification list`,
        sample_data_yaml: YAML.stringify({
          title: firstHeadingText(tokens) || 'Classifications',
          labels,
          items: l.items.slice(0, 5).map((it, idx) => {
            const m = /\b(URGENT|USEFUL|NOISE|SPAM|HIGH|MEDIUM|LOW|YES|NO|MAYBE|APPROVED|REJECTED)\b/.exec((it.text || '').toUpperCase());
            return {
              id: 'i' + (idx + 1),
              title: (it.text || '').replace(/\b(URGENT|USEFUL|NOISE|SPAM|HIGH|MEDIUM|LOW|YES|NO|MAYBE|APPROVED|REJECTED)\b/i, '').trim().slice(0, 120),
              current_label: m ? m[1] : labels[0].value
            };
          })
        }).trim()
      };
    }
  }
  return null;
}

function detectQAndA(tokens) {
  // Look for a list of question-like items ending with '?'
  const lists = tokens.filter((t) => t.type === 'list');
  for (const l of lists) {
    const qs = l.items.filter((it) => /\?\s*$/.test((it.text || '').trim().split('\n')[0]));
    if (qs.length >= 2) {
      return {
        template: 'q-and-a',
        confidence: 0.62,
        line_start: l._line_start,
        line_end: l._line_end,
        reason: `Found ${qs.length} question-shaped items`,
        sample_data_yaml: YAML.stringify({
          title: firstHeadingText(tokens) || 'Clarifying questions',
          questions: qs.slice(0, 8).map((it, idx) => ({
            id: 'q' + (idx + 1),
            prompt: (it.text || '').split('\n')[0],
            kind: 'free'
          }))
        }).trim()
      };
    }
  }
  return null;
}

function detectEmailDigest(tokens) {
  const lists = tokens.filter((t) => t.type === 'list');
  for (const l of lists) {
    let mailish = 0;
    for (const it of l.items) {
      if (/from:|subject:|sender:|to:/i.test(it.text || '')) mailish++;
    }
    if (mailish >= 2) {
      return {
        template: 'email-digest',
        confidence: 0.68,
        line_start: l._line_start,
        line_end: l._line_end,
        reason: `Found ${mailish} items with email-like fields (From:/Subject:)`,
        sample_data_yaml: YAML.stringify({
          title: firstHeadingText(tokens) || 'Inbox digest',
          categories: [{ name: 'Inbox', items: l.items.slice(0, 6).map((it) => ({ from: 'unknown', subject: (it.text || '').split('\n')[0] })) }]
        }).trim()
      };
    }
  }
  return null;
}

function detectDataTable(tokens) {
  const tables = tokens.filter((t) => t.type === 'table');
  for (const t of tables) {
    if (t.rows.length < 3 || t.header.length < 3) continue;
    // Already used by decision-matrix? Don't double-suggest if first column is a clear "criteria" header.
    const headers = t.header.map((c) => (c.text || '').toLowerCase());
    const looksScored = headers.some((h) => /weight|score|criteria|criterion/.test(h));
    if (looksScored) continue;
    const rows = t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h.text, r[i]?.text || ''])));
    return {
      template: 'data-table',
      confidence: 0.55,
      line_start: t._line_start,
      line_end: t._line_end,
      reason: `Generic table with ${t.header.length} columns, ${t.rows.length} rows`,
      sample_data_yaml: YAML.stringify({
        title: firstHeadingText(tokens) || 'Data',
        columns: t.header.map((c) => ({ key: (c.text || '').toLowerCase().replace(/\s+/g, '_'), label: c.text || '' })),
        rows: rows.slice(0, 8)
      }).trim()
    };
  }
  return null;
}

function detectSlideDeck(tokens) {
  const hrs = tokens.filter((t) => t.type === 'hr');
  if (hrs.length < 2) return null;
  const headings = tokens.filter((t) => t.type === 'heading');
  if (headings.length < 3) return null;
  const start = (headings[0] || hrs[0])._line_start;
  const end = hrs[hrs.length - 1]._line_end;
  return {
    template: 'slide-deck',
    confidence: 0.58,
    line_start: start,
    line_end: end,
    reason: `Found ${hrs.length} horizontal rules separating ${headings.length} headings — looks like slide separators`,
    sample_data_yaml: YAML.stringify({
      title: firstHeadingText(tokens) || 'Deck',
      slides: headings.slice(0, 6).map((h) => ({ title: h.text, body: '' }))
    }).trim()
  };
}

function detectApprovalList(tokens) {
  // Items that include approve/reject/merge language
  const lists = tokens.filter((t) => t.type === 'list');
  for (const l of lists) {
    let n = 0;
    for (const it of l.items) {
      if (/\b(approve|reject|merge|skip|hold|review)\b/i.test(it.text || '')) n++;
    }
    if (n >= 2) {
      return {
        template: 'approval-list',
        confidence: 0.58,
        line_start: l._line_start,
        line_end: l._line_end,
        reason: `Found ${n} items containing approve/reject/merge language`,
        sample_data_yaml: YAML.stringify({
          title: firstHeadingText(tokens) || 'Items to approve',
          items: l.items.slice(0, 6).map((it, idx) => ({
            id: 'a' + (idx + 1),
            title: (it.text || '').split('\n')[0]
          }))
        }).trim()
      };
    }
  }
  return null;
}

function detectRankOrder(tokens) {
  // Numbered list with items that look like alternatives (no labels, no checkboxes)
  const lists = tokens.filter((t) => t.type === 'list' && t.ordered === true);
  for (const l of lists) {
    if (l.items.length < 3) continue;
    const labelish = l.items.some((it) => /\b(URGENT|USEFUL|NOISE)\b/.test(it.text || ''));
    if (labelish) continue;
    return {
      template: 'rank-order',
      confidence: 0.5,
      line_start: l._line_start,
      line_end: l._line_end,
      reason: `Ordered list with ${l.items.length} items — could become a draggable rank widget`,
      sample_data_yaml: YAML.stringify({
        title: firstHeadingText(tokens) || 'Rank',
        items: l.items.map((it, idx) => ({ id: 'r' + (idx + 1), title: (it.text || '').split('\n')[0] }))
      }).trim()
    };
  }
  return null;
}

function detectDashboard(tokens) {
  // Look for list with "X: <number>" pattern repeating (KPI-like)
  const lists = tokens.filter((t) => t.type === 'list');
  for (const l of lists) {
    let kpiLikely = 0;
    const metrics = [];
    for (const it of l.items) {
      const m = /^([A-Za-z][A-Za-z0-9 _-]+?)\s*[:\-]\s*([\$£€]?[\d,.]+[%kKmM]?)\s*$/.exec((it.text || '').trim());
      if (m) {
        kpiLikely++;
        metrics.push({ label: m[1].trim(), value: parseValue(m[2]) });
      }
    }
    if (kpiLikely >= 3) {
      return {
        template: 'dashboard',
        confidence: 0.68,
        line_start: l._line_start,
        line_end: l._line_end,
        reason: `Found ${kpiLikely} key:value KPI-shaped items`,
        sample_data_yaml: YAML.stringify({ title: firstHeadingText(tokens) || 'KPIs', metrics }).trim()
      };
    }
  }
  return null;
}

function parseValue(s) {
  const cleaned = s.replace(/[\$£€,]/g, '');
  const m = /^([\d.]+)([kKmM%]?)$/.exec(cleaned);
  if (!m) return s;
  let n = parseFloat(m[1]);
  if (m[2] === 'k' || m[2] === 'K') n *= 1000;
  if (m[2] === 'm' || m[2] === 'M') n *= 1_000_000;
  return n;
}

function firstHeadingText(tokens) {
  const h = tokens.find((t) => t.type === 'heading' && t.depth === 1);
  return h ? h.text : null;
}
