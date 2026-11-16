// Home: greeting, alerts, current cycle, next session, this week, cycle progression, latest records.

import * as db from '../../data/db.js';
import { h, openSheet } from '../components.js';
import { cycleProgress, estimateEndDate, sessionsThisWeek } from '../../engine/rotation.js';
import { buildSessionPlan, t1ExerciseIds, blockById } from '../../engine/program.js';
import { estimateMinutes } from '../../engine/duration.js';
import { sessionBaseE1rm } from '../../engine/load.js';
import { formatDateLong, formatDateFull, formatNumber, daysBetween } from '../../engine/dates.js';
import { prepareSession, startSession } from '../session.js';
import { applyUpdate } from '../app.js';
import { exportBackupFlow, bodyweightFlow } from './settings.js';

function rotationLabel(program, idx) {
  const r = program.rotation[idx];
  const b = blockById(program, r.blockId);
  const t = program.sessionTypes.find((s) => s.id === r.sessionTypeId);
  return `${b.name} · ${t.name}`;
}

/** Max estimate of an exercise at one session: mean of its 2 best sets. */
function maxAt(sets, ex, bw) {
  return sessionBaseE1rm(sets, ex, bw);
}

function progressionRows(app, sets, cycle) {
  const rows = [];
  for (const id of t1ExerciseIds(app.program)) {
    const ex = app.exercises[id];
    const mine = sets.filter((s) => s.exerciseId === id && s.cycleId === cycle.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!mine.length) continue;
    const sessions = [...new Set(mine.map((s) => s.sessionId))];
    const first = maxAt(mine.filter((s) => s.sessionId === sessions[0]), ex, app.bodyweight);
    const last = maxAt(mine.filter((s) => s.sessionId === sessions[sessions.length - 1]), ex, app.bodyweight);
    if (first == null || last == null) continue;
    const pct = ((last - first) / first) * 100;
    rows.push(`<div class="line"><span>${h(ex.name)}${ex.equipment === 'weighted_bodyweight' ? ' <span class="muted small">(poids du corps inclus)</span>' : ''}</span><span>${formatNumber(last)} kg${sessions.length > 1 ? `, ${pct >= 0 ? '+' : ''}${formatNumber(pct)} %` : ''}</span></div>`);
  }
  return rows.join('');
}

export async function renderHome(app, main) {
  const sessions = await db.allSessions();
  const sets = await db.allSets();
  const cycle = await db.getCycle(app.state.currentCycleId);
  const rotLen = app.program.rotation.length;
  const cycleSessions = sessions.filter((s) => s.cycleId === cycle?.id);
  const cp = cycle ? cycleProgress(cycle, cycleSessions, rotLen) : null;
  const doneDates = sessions.filter((s) => s.status === 'complete' || s.status === 'partial').map((s) => s.startedAt);
  const end = cp ? estimateEndDate(doneDates, cp.total - cp.done, new Date(), { cycleStart: cycle.startedAt, perWeek: app.settings.sessionsPerWeek || 3 }) : null;
  const idx = app.state.rotationIndex;
  const nextEntry = app.program.rotation[idx];
  const plan = buildSessionPlan(app.program, nextEntry, app.exercises);
  const minutes = estimateMinutes(plan.items, app.program.superset);
  const name = app.settings.firstName ? `Bonjour ${h(app.settings.firstName)}` : 'Bonjour';
  const now = new Date();

  const alerts = [];
  if (app.swWaiting && !app.session) {
    alerts.push(`<div class="banner"><div class="grow">Nouvelle version disponible</div><button type="button" class="btn btn-orange" id="update">Mettre à jour</button></div>`);
  }
  const hasData = sessions.some((s) => s.status === 'complete' || s.status === 'partial');
  const lastExport = app.state.lastExportAt;
  if (hasData && (!lastExport || daysBetween(lastExport, now) > 7)) {
    alerts.push(`<div class="banner"><div class="grow">${lastExport ? 'Aucune sauvegarde exportée depuis plus de 7 jours.' : 'Aucune sauvegarde exportée pour l’instant.'}</div><button type="button" class="btn btn-orange" id="export">Exporter maintenant</button></div>`);
  }
  const bwPrompt = app.state.lastBodyweightPromptAt;
  if (!app.bodyweight || (bwPrompt && daysBetween(bwPrompt, now) > 30)) {
    alerts.push(`<div class="banner"><div class="grow">Mets à jour ton poids de corps${app.bodyweight ? ` (${formatNumber(app.bodyweight)} kg enregistrés)` : ''}.</div><button type="button" class="btn btn-orange" id="bw">Mettre à jour</button></div>`);
  }

  const active = app.session && app.session.status === 'in_progress' ? app.session : null;
  const records = sets.filter((s) => s.pr).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const prog = cycle ? progressionRows(app, sets, cycle) : '';
  const week = sessionsThisWeek(sessions, now);

  main.innerHTML = `
    <div class="row">
      <div class="grow"><h1>${name}</h1><p class="muted">${h(formatDateLong(now))}</p></div>
      <button type="button" class="btn btn-orange btn-more" id="menu" aria-label="Menu">...</button>
    </div>
    ${alerts.join('')}
    ${active ? `
      <div class="card">
        <div class="block-title">Séance en cours</div>
        <p class="ex-name">${h(active.blockName)} · ${h(active.sessionName)}</p>
        <button type="button" class="btn btn-green btn-block btn-big" id="resume">Reprendre la séance</button>
      </div>` : ''}
    ${cp ? `
      <div class="card">
        <div class="block-title">Cycle en cours</div>
        <p class="ex-name">${h(cycle.name)}</p>
        ${cp.finished
          ? '<p>Cycle terminé : lance le suivant depuis le menu ...</p>'
          : `<p>Séance ${cp.current} / ${cp.total} · Phase : ${h(blockById(app.program, nextEntry.blockId).short || blockById(app.program, nextEntry.blockId).name)}</p>
             <p class="muted small">Fin estimée : ${h(formatDateFull(end))}</p>`}
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${cp.total}" aria-valuenow="${cp.done}" aria-label="Séances faites"><div style="width:${Math.round(cp.ratio * 100)}%"></div></div>
        <p class="muted small">${cp.done} séance${cp.done > 1 ? 's' : ''} faite${cp.done > 1 ? 's' : ''} sur ${cp.total}</p>
      </div>` : ''}
    ${active ? '' : `
      <div class="card">
        <div class="block-title">Prochaine séance</div>
        <p class="ex-name">${h(rotationLabel(app.program, idx))}</p>
        <p class="muted small">${plan.items.map((i) => h(app.exercises[i.exerciseId].name)).join(' · ')}</p>
        <p class="small">Durée estimée : ${minutes} min de travail, plus ton échauffement</p>
        <div class="list" style="margin-top:8px">
          <button type="button" class="btn btn-green btn-block btn-big" id="start">Démarrer la séance</button>
          <div class="two-col">
            <button type="button" class="btn btn-orange" id="preview">Aperçu</button>
            <button type="button" class="btn btn-orange" id="other">Autre séance</button>
          </div>
        </div>
      </div>`}
    <div class="card">
      <div class="block-title">Cette semaine</div>
      <p>${week} séance${week > 1 ? 's' : ''} faite${week > 1 ? 's' : ''} sur ${app.settings.sessionsPerWeek || 3} prévues</p>
    </div>
    ${prog ? `<div class="card"><div class="block-title">Progression du cycle (max estimé)</div>${prog}</div>` : ''}
    ${records.length ? `<div class="card"><div class="block-title">Derniers records</div>
      ${records.map((r) => `<div class="line"><span>${h(app.exercises[r.exerciseId]?.name || r.exerciseId)}</span><span>${formatNumber(r.e1rm)} kg estimés</span></div>`).join('')}</div>` : ''}
  `;

  const on = (id, fn) => { const el = main.querySelector(`#${id}`); if (el) el.addEventListener('click', fn); };
  on('update', () => applyUpdate());
  on('export', () => exportBackupFlow(app).then(() => app.go('home')));
  on('bw', () => bodyweightFlow(app).then(() => app.go('home')));
  on('resume', () => app.go(active.rest ? 'rest' : 'set'));
  on('start', async () => {
    const s = await prepareSession(app, idx);
    await startSession(app, s);
    app.go('set');
  });
  on('preview', () => app.go('preview', { rotationIndex: idx }));
  on('other', () => chooseOther(app));
  on('menu', () => homeMenu(app));
}

function chooseOther(app) {
  const body = '<p class="muted">Choisis une séance de la rotation. La rotation continue ensuite après la séance choisie.</p>';
  openSheet({
    title: 'Choisir une séance',
    body,
    actions: app.program.rotation.map((r, i) => ({
      label: `${i + 1}. ${rotationLabel(app.program, i)}`,
      kind: 'orange',
      onClick: (close) => { close(); app.go('preview', { rotationIndex: i, manual: i !== app.state.rotationIndex }); },
    })).concat([{ label: 'Fermer', kind: 'orange', onClick: (close) => close() }]),
  });
}

function homeMenu(app) {
  // "Terminer le cycle et recommencer un cycle complet" is added in V2 with the cycle summary.
  openSheet({
    title: 'Menu',
    actions: [
      { label: 'Exporter ma sauvegarde', kind: 'orange', onClick: (close) => { close(); exportBackupFlow(app).then(() => app.go('home')); } },
      { label: 'Mettre à jour mon poids de corps', kind: 'orange', onClick: (close) => { close(); bodyweightFlow(app).then(() => app.go('home')); } },
      { label: 'Fermer', kind: 'orange', onClick: (close) => close() },
    ],
  });
}
