// Exercise sheet: technique, intensity, today's plan, last time, start button.

import { h, fmtLoad, loadUnit, repsUnit, rirLabel } from '../components.js';
import { TIER_LABELS } from '../../engine/program.js';
import { intensityPhrase } from '../../engine/intensity.js';
import { formatNumber } from '../../engine/dates.js';
import { startSession, jumpTo } from '../session.js';

function kindLabel(kind) {
  return { top: 'Série lourde', work: 'Série de travail', power: 'Série', finisher: 'Série' }[kind] || 'Série';
}

export async function renderExerciseSheet(app, main, params) {
  const s = params.inSession ? app.session : app.previewSession;
  if (!s) return app.go('home');
  const item = s.items[params.itemIndex];
  const ex = app.exercises[item.exerciseId];
  const partner = item.group && !(s.split || []).includes(item.group) ? s.items.find((it) => it !== item && it.group === item.group) : null;
  const hasTop = item.sets.some((x) => x.kind === 'top');
  const phrase = intensityPhrase(item, item.sets.find((x) => x.status === 'todo') || item.sets[0]);
  const lastLine = item.sets.find((x) => x.last)?.last;
  main.innerHTML = `
    <div class="card">
      <div class="tier-band tier-${item.tier}" aria-hidden="true"></div>
      <p class="small muted">${h(item.tier)} · ${h(TIER_LABELS[item.tier])} · ${h(item.pattern)}</p>
      <h1>${h(ex.name)}</h1>
      ${partner ? `<span class="pill">Superset avec ${h(app.exercises[partner.exerciseId].name)}</span>` : ''}
    </div>
    <div class="card"><div class="block-title">L’exercice</div><p>${h(ex.cue)}</p>${ex.notes ? `<p class="muted">${h(ex.notes)}</p>` : ''}</div>
    ${phrase ? `<div class="card"><div class="block-title">L’intensité</div><p>${h(phrase)}</p></div>` : ''}
    <div class="card">
      <div class="block-title">Ton plan aujourd’hui</div>
      ${item.sets.map((x, i) => `
        <div class="line"><span>${i + 1}. ${kindLabel(x.kind)}${x.status === 'done' ? ' (faite)' : x.status === 'skipped' ? ' (non faite)' : ''}</span>
        <span>${x.targetReps ?? ''} ${repsUnit(ex)}${x.proposed != null ? ` · ${fmtLoad(x.proposed, ex)} ${loadUnit(ex)}` : ''}</span></div>`).join('')}
      ${hasTop ? '<p class="muted small">Les séries de travail seront recalculées après la série lourde.</p>' : ''}
    </div>
    <div class="card">
      <div class="block-title">Ta progression</div>
      ${item.best != null ? `<p>Record de max estimé : ${formatNumber(item.best)} kg</p>` : '<p class="muted">Pas encore de record.</p>'}
      ${lastLine ? `<p>Dernière fois : ${fmtLoad(lastLine.load, ex)} ${loadUnit(ex)} x ${lastLine.reps ?? '?'}${lastLine.rir != null ? `, ${rirLabel(lastLine.rir, app.settings)}` : ''}${lastLine.sameBlock ? '' : lastLine.blockName ? ` (bloc ${h(lastLine.blockName)})` : ''}</p>` : '<p class="muted">Première fois sur cet exercice.</p>'}
    </div>
    <div class="sticky-bottom"><div class="inner list">
      ${item.sets.some((x) => x.status === 'todo') ? `<button type="button" class="btn btn-green btn-block btn-big" id="go">${partner ? 'Commencer le superset' : 'Commencer l’exercice'}</button>` : ''}
      <button type="button" class="btn btn-orange btn-block" id="back">Retour</button>
    </div></div>`;
  main.style.paddingBottom = '150px';
  main.querySelector('#back').addEventListener('click', () => {
    if (params.inSession) app.go(params.back || 'set');
    else app.go('preview', { rotationIndex: params.rotationIndex });
  });
  const go = main.querySelector('#go');
  if (go) go.addEventListener('click', async () => {
    if (!params.inSession) {
      await startSession(app, app.previewSession);
      app.previewSession = null;
    }
    await jumpTo(app, params.itemIndex);
    app.go('set');
  });
}
