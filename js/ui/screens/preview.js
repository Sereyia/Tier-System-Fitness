// Session preview: exercises, planned sets and proposed loads, estimated duration.

import { h, fmtLoad, loadUnit, repsUnit, rirRangeText } from '../components.js';
import { estimateMinutes, exceedsMaxDuration } from '../../engine/duration.js';
import { TIER_LABELS } from '../../engine/program.js';
import { unitsOf } from '../../engine/session-flow.js';
import { prepareSession, startSession } from '../session.js';

export function setsSummary(app, item) {
  const ex = app.exercises[item.exerciseId];
  const groups = [];
  for (const s of item.sets) {
    const reps = s.repsRange ? (s.repsRange[0] === s.repsRange[1] ? `${s.repsRange[0]}` : `${s.repsRange[0]}-${s.repsRange[1]}`) : '';
    const key = `${s.kind}|${reps}|${s.proposed}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.n++;
    else groups.push({ key, n: 1, kind: s.kind, reps, load: s.proposed });
  }
  return groups.map((g) => {
    const load = g.load != null ? ` à ${fmtLoad(g.load, ex)} ${loadUnit(ex)}` : '';
    const kind = g.kind === 'top' ? ' (série lourde)' : '';
    return `${g.n} x ${g.reps} ${repsUnit(ex)}${load}${kind}`;
  }).join(' puis ');
}

export async function renderPreview(app, main, params) {
  if (!app.previewSession || app.previewSession.rotationIndex !== params.rotationIndex || params.refresh) {
    app.previewSession = await prepareSession(app, params.rotationIndex, { manual: !!params.manual });
  }
  const s = app.previewSession;
  const minutes = estimateMinutes(s.items, app.program.superset);
  const units = unitsOf(s.items);
  const itemHtml = (i) => {
    const it = s.items[i];
    const ex = app.exercises[it.exerciseId];
    const rir = (it.sets.find((x) => x.rir && x.kind === 'work') || it.sets.find((x) => x.rir))?.rir;
    return `
      <button type="button" class="btn btn-orange list-btn" data-item="${i}">
        <span><span class="tier-dot tier-${it.tier}" aria-hidden="true"></span>${h(ex.name)}<br>
        <span class="small" style="font-weight:600">${h(it.tier)} · ${h(setsSummary(app, it))}${rir ? ` · RIR ${rirRangeText(rir, app.settings)}` : ''}</span></span>
      </button>`;
  };
  main.innerHTML = `
    <h1>${h(s.blockName)} · ${h(s.sessionName)}</h1>
    <p class="muted">Durée estimée : ${minutes} min de travail, plus ton échauffement.</p>
    ${exceedsMaxDuration(minutes) ? '<div class="banner"><div class="grow">Plus de 80 minutes de travail estimé.</div></div>' : ''}
    ${units.map((u, n) => `
      <div class="card">
        <div class="block-title">${u.type === 'pair' ? `Superset · ${n + 1}` : `Seul · ${n + 1}`}</div>
        <div class="list">${u.items.map(itemHtml).join('')}</div>
      </div>`).join('')}
    <p class="muted small">Touche un exercice pour voir sa fiche. Tiers : ${Object.entries(TIER_LABELS).map(([k, v]) => `${k} ${h(v)}`).join(', ')}.</p>
    <div class="sticky-bottom"><div class="inner list">
      <button type="button" class="btn btn-green btn-block btn-big" id="start">Démarrer la séance</button>
      <button type="button" class="btn btn-orange btn-block" id="back">Retour</button>
    </div></div>`;
  main.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => app.go('exercise', { itemIndex: Number(b.dataset.item), from: 'preview', rotationIndex: params.rotationIndex })));
  main.querySelector('#back').addEventListener('click', () => app.go('home'));
  main.querySelector('#start').addEventListener('click', async () => {
    if (app.session) return app.go('set');
    await startSession(app, app.previewSession);
    app.previewSession = null;
    app.go('set');
  });
  main.style.paddingBottom = '150px';
}
