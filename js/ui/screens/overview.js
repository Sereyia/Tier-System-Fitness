// Overview: compact list of the session's exercises, progress, jump to an exercise, edit a validated set.

import { h, fmtLoad, loadUnit, repsUnit, rirLabel, openSheet } from '../components.js';
import { unitsOf } from '../../engine/session-flow.js';
import { sessionHeader, bindSessionHeader } from './set.js';
import { jumpTo, editDoneSet } from '../session.js';

export async function renderOverview(app, main) {
  const s = app.session;
  if (!s) return app.go('home');
  const units = unitsOf(s.items, s.split);
  const row = (i) => {
    const it = s.items[i];
    const ex = app.exercises[it.exerciseId];
    const visible = it.sets.filter((x) => x.status !== 'skipped');
    const done = visible.filter((x) => x.status === 'done').length;
    const finished = it.sets.every((x) => x.status !== 'todo');
    return `<button type="button" class="btn btn-orange list-btn" data-item="${i}">
      <span><span class="tier-dot tier-${it.tier}" aria-hidden="true"></span>${h(ex.name)}</span>
      <span>${done}/${visible.length}${finished ? ' <span aria-hidden="true">✓</span><span class="sr-only">terminé</span>' : ''}</span></button>`;
  };
  main.innerHTML = `
    ${sessionHeader(app, s)}
    <h1>${h(s.blockName)} · ${h(s.sessionName)}</h1>
    ${units.map((u) => `<div class="card"><div class="block-title">${u.type === 'pair' ? 'Superset' : 'Seul'}</div><div class="list">${u.items.map(row).join('')}</div></div>`).join('')}
    <div class="sticky-bottom"><div class="inner">
      <button type="button" class="btn btn-green btn-done" id="back">${s.rest ? 'Retour au repos' : 'Retour à la série'}</button>
    </div></div>`;
  bindSessionHeader(app, main);
  main.querySelector('#back').addEventListener('click', () => app.go(s.rest ? 'rest' : 'set'));
  main.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => itemSheet(app, Number(b.dataset.item))));
}

function itemSheet(app, i) {
  const s = app.session;
  const it = s.items[i];
  const ex = app.exercises[it.exerciseId];
  const actions = [];
  if (it.sets.some((x) => x.status === 'todo')) {
    actions.push({ label: 'Aller à cet exercice', kind: 'green', onClick: async (close) => { close(); await jumpTo(app, i); app.go('set'); } });
  }
  it.sets.forEach((x, j) => {
    if (x.status !== 'done') return;
    const a = x.actual || {};
    const txt = `Série ${j + 1} : ${a.load != null ? `${fmtLoad(a.load, ex)} kg x ` : ''}${a.reps ?? '?'}${a.rir != null ? `, ${rirLabel(a.rir, app.settings)}` : ''} · Modifier`;
    actions.push({ label: txt, kind: 'orange', onClick: (close) => { close(); editSheet(app, i, j); } });
  });
  actions.push({ label: 'Fiche de l’exercice', kind: 'orange', onClick: (close) => { close(); app.go('exercise', { itemIndex: i, inSession: true, back: 'overview' }); } });
  actions.push({ label: 'Fermer', kind: 'orange', onClick: (close) => close() });
  openSheet({ title: ex.name, actions });
}

function editSheet(app, i, j) {
  const s = app.session;
  const it = s.items[i];
  const set = it.sets[j];
  const ex = app.exercises[it.exerciseId];
  const a = set.actual || {};
  const hasRir = set.kind !== 'power' && set.kind !== 'finisher' && !!set.rir;
  const sheet = openSheet({
    title: `Modifier la série ${j + 1}`,
    body: `
      ${ex.equipment !== 'none' ? `<label class="field"><span>Poids (${h(loadUnit(ex))})</span><input type="number" inputmode="decimal" step="any" id="e-load" value="${a.load ?? ''}"></label>` : ''}
      <label class="field"><span>${h(repsUnit(ex))}</span><input type="number" inputmode="numeric" step="1" min="0" id="e-reps" value="${a.reps ?? ''}"></label>
      ${hasRir ? `<label class="field"><span>RIR ressenti</span><select id="e-rir">${[0, 1, 2, 3, 4, 5].map((v) => `<option value="${v}" ${a.rir === v ? 'selected' : ''}>${v === 5 ? '5+' : v}</option>`).join('')}</select></label>` : ''}`,
    actions: [
      { label: 'Enregistrer', kind: 'green', onClick: async (close) => {
        const num = (id) => { const el = sheet.el.querySelector(id); if (!el || el.value === '') return null; return Number(el.value.replace(',', '.')); };
        await editDoneSet(app, i, j, { load: num('#e-load'), reps: num('#e-reps'), rir: hasRir ? num('#e-rir') : null });
        close();
        app.go('overview');
      } },
      { label: 'Annuler', kind: 'orange', onClick: (close) => close() },
    ],
  });
}
