// Program (read-only in V1): rotation, blocks and their parameters by tier, session types and supersets.

import { h, rirRangeText } from '../components.js';
import { TIER_LABELS, TIERS, blockById } from '../../engine/program.js';
import { formatNumber } from '../../engine/dates.js';

const range = (r) => (r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]} à ${r[1]}`) : '-');

export async function renderProgramView(app, main) {
  const p = app.program;
  const ex = app.exercises;
  main.innerHTML = `
    <h1>${h(p.name)}</h1>
    <p class="muted small">Lecture seule dans cette version. L’éditeur de programme arrive en V2.</p>
    <div class="card">
      <div class="block-title">Rotation (${p.rotation.length} séances)</div>
      ${p.rotation.map((r, i) => `<div class="line"><span>${i + 1}. ${h(blockById(p, r.blockId).name)}</span><span>${h(p.sessionTypes.find((t) => t.id === r.sessionTypeId).name)}${i === app.state.rotationIndex ? ' · prochaine' : ''}</span></div>`).join('')}
    </div>
    ${p.blocks.map((b) => `
      <div class="card">
        <div class="block-title">Bloc ${h(b.name)}${b.reference ? ' · référence des charges' : ''}</div>
        <table class="params">
          <thead><tr><th>Tier</th><th>Séries</th><th>Reps</th><th>RIR</th><th>Repos</th><th>Coef.</th></tr></thead>
          <tbody>${TIERS.map((t) => {
            const x = b.tiers[t] || {};
            const top = x.topSet ? `<br><span class="muted">+ série lourde ${range(x.topSet.reps)} RIR ${rirRangeText(x.topSet.rir)}, ${x.topSet.rest} s (sinon ${x.setsWithoutTopSet} séries)</span>` : '';
            return `<tr><td>${t}</td><td>${x.sets ?? '-'}</td><td>${range(x.reps)}${top}</td><td>${x.rir ? rirRangeText(x.rir) : '-'}</td><td>${x.rest ?? '-'} s</td><td>${x.coef != null ? formatNumber(x.coef, 2) : '-'}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>`).join('')}
    ${p.sessionTypes.map((t) => {
      const seen = new Set();
      const rows = t.slots.map((s, i) => {
        if (seen.has(s.id)) return '';
        seen.add(s.id);
        const partner = s.group ? t.slots.find((o) => o.id !== s.id && o.group === s.group) : null;
        if (partner) seen.add(partner.id);
        const line = (x) => `${h(x.pattern)}, ${h(x.tier)}, ${h(ex[x.exerciseId]?.name || x.exerciseId)}${x.params ? ' <span class="muted">(paramètres propres)</span>' : ''}`;
        return `<div class="line"><span>${i + 1}. ${partner ? 'Superset' : 'Seul'}</span><span style="text-align:right">${line(s)}${partner ? `<br>${line(partner)}` : ''}</span></div>`;
      }).join('');
      return `<div class="card"><div class="block-title">${h(t.name)}</div>${rows}</div>`;
    }).join('')}
    <p class="muted small">Tiers : ${TIERS.map((t) => `${t} ${h(TIER_LABELS[t])}`).join(', ')}.</p>`;
}
