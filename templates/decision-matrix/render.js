import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const criteria = (data.criteria || []).map((c, i) => ({
    name: c.name,
    weight: c.weight ?? 1,
    direction: c.direction || 'higher_better',
    note: c.note || '',
    cid: 'c' + i
  }));
  const options = (data.options || []).map((o, i) => ({
    name: o.name,
    scores: o.scores || {},
    oid: 'o' + i
  }));

  const totals = computeTotals(criteria, options);
  const winnerIdx = pickWinnerIdx(totals);
  const recommendation = data.recommendation || (winnerIdx >= 0 ? options[winnerIdx]?.name : null);

  const initialState = {
    block_id: data.block_id || '',
    question: data.question,
    prompt_intro: data.prompt_intro || '',
    criteria: criteria.map((c) => ({ ...c, original_weight: c.weight })),
    options: options.map((o) => ({
      oid: o.oid,
      name: o.name,
      scores: { ...o.scores },
      original_scores: { ...o.scores }
    })),
    original_recommendation: recommendation || ''
  };

  return html`
    <main class="dm">
      <header class="dm-head">
        <span class="dm-eyebrow">Decision Matrix</span>
        <h1 class="dm-question">${data.question}</h1>
        ${data.context ? html`<p class="dm-context">${data.context}</p>` : ''}
        <p class="dm-hint">Click any score or weight to edit. The recommendation re-computes live.</p>
      </header>

      <div class="dm-table-wrap">
        <table class="dm-table" data-dm-table>
          <thead>
            <tr>
              <th class="dm-criteria-col">Criterion</th>
              <th class="dm-weight-col">Weight</th>
              ${options.map((o, i) => html`
                <th class="dm-option ${i === winnerIdx ? 'dm-winner' : ''}" data-dm-opt="${o.oid}" data-dm-opt-idx="${i}">${o.name}</th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${criteria.map((c) => row(c, options, h))}
            <tr class="dm-total-row">
              <td colspan="2" class="dm-total-label">Weighted total</td>
              ${options.map((o, i) => html`
                <td class="dm-total ${i === winnerIdx ? 'dm-winner' : ''}" data-dm-total="${o.oid}">
                  <div class="dm-total-bar">
                    <span data-dm-bar="${o.oid}" style="width: ${(totals[i] * 100).toFixed(1)}%"></span>
                  </div>
                  <strong data-dm-total-val="${o.oid}">${(totals[i] * 100).toFixed(1)}</strong>
                </td>
              `)}
            </tr>
          </tbody>
        </table>
      </div>

      <aside class="dm-rec" data-dm-rec>
        <span class="dm-rec-pill">Recommendation</span>
        <strong data-dm-rec-name>${recommendation || '—'}</strong>
        ${winnerIdx >= 0 ? html`<span class="dm-rec-score" data-dm-rec-score>score ${(totals[winnerIdx] * 100).toFixed(1)}/100</span>` : html`<span class="dm-rec-score" data-dm-rec-score></span>`}
      </aside>

      <section class="dm-rationale">
        <label class="dm-rationale-label" for="dm-rationale">Your rationale (optional)</label>
        <textarea id="dm-rationale" class="dm-rationale-input" data-dm-rationale rows="2" placeholder="Why you'd pick this option (or a different one). Anything the matrix doesn't capture."></textarea>
      </section>

      <button type="button" class="dm-fab" data-dm-copy aria-label="Send revised matrix back">
        <span aria-hidden="true">&#x21B5;</span>
        <span>Send revised matrix back</span>
        <span class="dm-fab-badge" data-dm-changed>0</span>
      </button>

      <div class="dm-modal" data-dm-modal hidden role="dialog" aria-modal="true">
        <div class="dm-backdrop" data-dm-close></div>
        <div class="dm-panel">
          <header><h2>Revised matrix</h2><button type="button" class="dm-x" data-dm-close aria-label="Close">&#x2715;</button></header>
          <pre class="dm-pre" data-dm-text></pre>
          <footer>
            <button type="button" class="dm-btn dm-btn-ghost" data-dm-close>Cancel</button>
            <button type="button" class="dm-btn dm-btn-primary" data-dm-confirm>Copy</button>
          </footer>
        </div>
      </div>
      <div class="dm-toast" data-dm-toast hidden role="status" aria-live="polite"></div>

      <script type="application/json" data-dm-state data-htmd-state="decision-matrix">${h.raw(safeJson(initialState))}</script>
    </main>
  `;
}

function row(c, options, h) {
  const allValues = options.map((o) => o.scores?.[c.name]).filter((x) => typeof x === 'number');
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;
  return html`
    <tr data-dm-row="${c.cid}">
      <td class="dm-crit">
        <span class="dm-crit-name">${c.name}</span>
        ${c.note ? html`<small class="dm-crit-note">${c.note}</small>` : ''}
      </td>
      <td class="dm-weight">
        <input type="number" class="dm-weight-input" data-dm-weight="${c.cid}" value="${c.weight}" min="0" step="1">
        ${c.direction === 'lower_better' ? html` <small title="lower is better">↓</small>` : ''}
      </td>
      ${options.map((o) => {
        const raw = o.scores?.[c.name];
        const heat = computeHeat(raw, min, max, range, c.direction);
        const tone = heat == null ? 'empty' : heat >= 0.66 ? 'good' : heat >= 0.33 ? 'mid' : 'low';
        return html`<td class="dm-cell dm-cell-${tone}" data-dm-cell="${o.oid}:${c.cid}" style="--heat: ${heat == null ? 0 : heat.toFixed(2)}">
          <input type="number" class="dm-cell-input" data-dm-score="${o.oid}:${c.cid}" data-dm-criterion="${c.name}" data-dm-option="${o.oid}" value="${typeof raw === 'number' ? raw : ''}" placeholder="—" step="0.5">
        </td>`;
      })}
    </tr>
  `;
}

function computeTotals(criteria, options) {
  return options.map((opt) => {
    let total = 0;
    let weightSum = 0;
    for (const c of criteria) {
      const raw = opt.scores?.[c.name];
      if (typeof raw !== 'number') continue;
      const dir = c.direction || 'higher_better';
      const allValues = options.map((o) => o.scores?.[c.name]).filter((x) => typeof x === 'number');
      if (allValues.length === 0) continue;
      const max = Math.max(...allValues, 1);
      const min = Math.min(...allValues, 0);
      const range = max - min || 1;
      const norm = dir === 'lower_better' ? 1 - (raw - min) / range : (raw - min) / range;
      total += norm * (c.weight || 1);
      weightSum += c.weight || 1;
    }
    return weightSum > 0 ? total / weightSum : 0;
  });
}

function pickWinnerIdx(totals) {
  if (!totals.length) return -1;
  const max = Math.max(...totals);
  if (!isFinite(max)) return -1;
  return totals.indexOf(max);
}

function computeHeat(raw, min, max, range, direction) {
  if (typeof raw !== 'number') return null;
  const dir = direction || 'higher_better';
  const norm = dir === 'lower_better' ? 1 - (raw - min) / range : (raw - min) / range;
  return Math.max(0, Math.min(1, norm));
}

function safeJson(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}
