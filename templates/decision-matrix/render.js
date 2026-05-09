import { html } from '../../src/html-tag.js';

export default function render(data, h) {
  const criteria = data.criteria || [];
  const options = data.options || [];

  // Compute weighted totals; for lower_better criteria, invert relative to max.
  const totals = options.map((opt) => {
    let total = 0;
    let weightSum = 0;
    for (const c of criteria) {
      const raw = opt.scores?.[c.name];
      if (typeof raw !== 'number') continue;
      const dir = c.direction || 'higher_better';
      const allValues = options.map((o) => o.scores?.[c.name]).filter((x) => typeof x === 'number');
      const max = Math.max(...allValues, 1);
      const min = Math.min(...allValues, 0);
      const range = max - min || 1;
      // Normalize 0..1
      const norm = dir === 'lower_better' ? 1 - (raw - min) / range : (raw - min) / range;
      total += norm * (c.weight || 1);
      weightSum += c.weight || 1;
    }
    return weightSum > 0 ? total / weightSum : 0;
  });

  const winnerIdx = totals.length ? totals.indexOf(Math.max(...totals)) : -1;
  const recommendation = data.recommendation || (winnerIdx >= 0 ? options[winnerIdx]?.name : null);

  return html`
    <main class="dm">
      <header class="dm-head">
        <span class="dm-eyebrow">Decision Matrix</span>
        <h1 class="dm-question">${data.question}</h1>
        ${data.context ? html`<p class="dm-context">${data.context}</p>` : ''}
      </header>

      <div class="dm-table-wrap">
        <table class="dm-table">
          <thead>
            <tr>
              <th class="dm-criteria-col">Criterion</th>
              <th class="dm-weight-col">Weight</th>
              ${options.map((o, i) => html`
                <th class="dm-option ${i === winnerIdx ? 'dm-winner' : ''}">${o.name}</th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${criteria.map((c) => row(c, options, h))}
            <tr class="dm-total-row">
              <td colspan="2" class="dm-total-label">Weighted total</td>
              ${options.map((o, i) => html`
                <td class="dm-total ${i === winnerIdx ? 'dm-winner' : ''}">
                  <div class="dm-total-bar">
                    <span style="width: ${(totals[i] * 100).toFixed(1)}%"></span>
                  </div>
                  <strong>${(totals[i] * 100).toFixed(1)}</strong>
                </td>
              `)}
            </tr>
          </tbody>
        </table>
      </div>

      ${recommendation ? html`
        <aside class="dm-rec">
          <span class="dm-rec-pill">Recommendation</span>
          <strong>${recommendation}</strong>
          ${winnerIdx >= 0 ? html`<span class="dm-rec-score">score ${(totals[winnerIdx] * 100).toFixed(1)}/100</span>` : ''}
        </aside>
      ` : ''}
    </main>
  `;
}

function row(c, options, h) {
  const allValues = options.map((o) => o.scores?.[c.name]).filter((x) => typeof x === 'number');
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;
  const dir = c.direction || 'higher_better';
  return html`
    <tr>
      <td class="dm-crit">
        ${c.name}
        ${c.note ? html`<small class="dm-crit-note">${c.note}</small>` : ''}
      </td>
      <td class="dm-weight">${c.weight ?? 1}${dir === 'lower_better' ? html` <small>↓</small>` : ''}</td>
      ${options.map((o) => {
        const raw = o.scores?.[c.name];
        if (typeof raw !== 'number') return html`<td class="dm-cell dm-empty">—</td>`;
        const norm = dir === 'lower_better' ? 1 - (raw - min) / range : (raw - min) / range;
        const heat = Math.max(0, Math.min(1, norm));
        const tone = heat >= 0.66 ? 'good' : heat >= 0.33 ? 'mid' : 'low';
        return html`<td class="dm-cell dm-cell-${tone}" style="--heat: ${heat.toFixed(2)}">
          <span class="dm-cell-val">${raw}</span>
        </td>`;
      })}
    </tr>
  `;
}
