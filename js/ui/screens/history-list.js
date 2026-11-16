// History (simple list in V1): sessions with status, duration and sets; tap for the set list.

import * as db from '../../data/db.js';
import { h, fmtLoad, rirLabel, openSheet, repsUnit } from '../components.js';
import { formatDateFull } from '../../engine/dates.js';

const STATUS = { complete: 'complète', partial: 'partielle', in_progress: 'en cours' };

export async function renderHistoryList(app, main) {
  const sessions = (await db.allSessions()).filter((s) => s.status !== 'planned');
  const sets = await db.allSets();
  const count = (id) => sets.filter((x) => x.sessionId === id).length;
  main.innerHTML = `
    <h1>Historique</h1>
    <p class="muted small">Statistiques, courbes et calendrier arrivent en V2.</p>
    ${sessions.length ? `<div class="list">${sessions.map((s) => {
      const min = s.endedAt ? Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 60000) : null;
      return `<button type="button" class="btn btn-orange list-btn" data-id="${h(s.id)}">
        <span>${h(formatDateFull(s.startedAt))}<br><span class="small">${h(s.blockName)} · ${h(s.sessionName)}</span></span>
        <span class="small" style="text-align:right">${STATUS[s.status] || s.status}<br>${count(s.id)} séries${min != null ? ` · ${min} min` : ''}</span></button>`;
    }).join('')}</div>` : '<div class="card"><p>Aucune séance pour l’instant.</p></div>'}`;
  main.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
    const s = sessions.find((x) => x.id === b.dataset.id);
    const mine = sets.filter((x) => x.sessionId === s.id).sort((a, c) => (a.date < c.date ? -1 : 1));
    const body = mine.length ? mine.map((r) => {
      const ex = app.exercises[r.exerciseId];
      return `<div class="line"><span>${h(ex?.name || r.exerciseId)}${r.kind === 'top' ? ' (lourde)' : ''}</span><span>${r.load != null ? `${h(fmtLoad(r.load, ex))} kg x ` : ''}${r.reps ?? '?'} ${ex ? h(repsUnit(ex)) : ''}${r.rir != null ? `, ${h(rirLabel(r.rir, app.settings))}` : ''}${r.pr ? ' · record' : ''}</span></div>`;
    }).join('') : '<p class="muted">Aucune série validée.</p>';
    openSheet({
      title: `${s.blockName} · ${s.sessionName}`,
      body: `<p class="muted">${h(formatDateFull(s.startedAt))} · séance ${STATUS[s.status] || s.status}${s.fatigue === true ? ' · fatigue élevée' : ''}</p>${body}`,
      actions: [{ label: 'Fermer', kind: 'orange', onClick: (c) => c() }],
    });
  }));
}
