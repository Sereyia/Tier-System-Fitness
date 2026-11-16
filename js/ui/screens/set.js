// "Série en cours": one set at a time, large values, thumb-zone controls.

import {
  h, fmtLoad, loadUnit, repsUnit, rirRangeText, rirLabel, openSheet, askNumber, bindRepeat, vibrate, showToast,
} from '../components.js';
import { TIER_LABELS } from '../../engine/program.js';
import { intensityPhrase } from '../../engine/intensity.js';
import { progressOf } from '../../engine/session-flow.js';
import { shiftLoad, platesPerSide, hasNoLoad } from '../../engine/load.js';
import { formatElapsed, formatNumber } from '../../engine/dates.js';
import * as db from '../../data/db.js';
import {
  currentStep, validateSet, undoLast, canUndo, addExtraSet, skipCurrentSet, splitCurrentPair, stopSession, saveNote, goNext,
} from '../session.js';

const RIR_OPTIONS = [
  { v: 0, short: 'Max', full: 'Effort max, plus aucune rep possible' },
  { v: 1, short: '1 en réserve', full: '1 rep encore possible' },
  { v: 2, short: '2 en réserve', full: '2 reps encore possibles' },
  { v: 3, short: '3 en réserve', full: '3 reps encore possibles' },
  { v: 4, short: '4 en réserve', full: '4 reps encore possibles' },
  { v: 5, short: 'Facile', full: 'Facile, 5 reps ou plus en réserve' },
];

export function sessionHeader(app, session) {
  const { done, total } = progressOf(session.items);
  return `
    <div class="session-head">
      <button type="button" class="btn btn-orange" id="overview" aria-label="Vue d\u2019ensemble de la séance">Séance</button>
      <span class="chrono grow center" id="chrono" aria-label="Durée de la séance"></span>
      <button type="button" class="btn btn-orange" id="stop">Arrêter la séance</button>
    </div>
    <div>
      <span class="small">Série ${Math.min(done + 1, total)} / ${total}</span>
      <div class="progress" aria-hidden="true"><div style="width:${total ? Math.round((done / total) * 100) : 0}%"></div></div>
    </div>`;
}

export function bindSessionHeader(app, main) {
  const chrono = main.querySelector('#chrono');
  const start = new Date(app.session.startedAt).getTime();
  const tick = () => { if (chrono) chrono.textContent = formatElapsed(Date.now() - start); };
  tick();
  app.timers.push(setInterval(tick, 1000));
  main.querySelector('#overview').addEventListener('click', () => app.go('overview'));
  main.querySelector('#stop').addEventListener('click', () => stopSheet(app));
}

export function stopSheet(app) {
  openSheet({
    title: 'Arrêter la séance ?',
    body: '<p>Les séries validées sont enregistrées. Les séries non faites restent comme prévu, sans effet sur la progression. La séance sera marquée « partielle ».</p>',
    actions: [
      { label: 'Arrêter et enregistrer', kind: 'orange', onClick: async (close) => {
        close();
        const s = app.session;
        await stopSession(app);
        app.lastEnded = s;
        app.session = null;
        app.go('summary', { sessionId: s.id, partial: true });
      } },
      { label: 'Continuer la séance', kind: 'green', onClick: (close) => close() },
    ],
  });
}

function ensureDraft(app, session, set) {
  const key = `${session.id}:${session.cursor}:${set.index}:${set.status}`;
  if (!app.draft || app.draft.key !== key) {
    app.draft = { key, load: set.proposed ?? null, reps: set.targetReps ?? null, rir: null, speed: null, hint: '' };
  }
  return app.draft;
}

function partnerOf(session, item) {
  if (!item.group || (session.split || []).includes(item.group)) return null;
  return session.items.find((it) => it !== item && it.group === item.group) || null;
}

export async function renderSet(app, main) {
  const session = app.session;
  if (!session) return app.go('home');
  const { step } = currentStep(session);
  if (!step) return app.go('home');
  const item = session.items[step.item];
  const set = item.sets[step.set];
  if (set.status !== 'todo') {
    // Cursor on a finished set (e.g. after an edit): move on.
    if (await goNext(app)) return app.go('set');
    return app.go('home');
  }
  const ex = app.exercises[item.exerciseId];
  const d = ensureDraft(app, session, set);
  const partner = partnerOf(session, item);
  const isPower = set.kind === 'power';
  const needsRir = !isPower && set.kind !== 'finisher' && !!set.rir;
  const showLoad = !hasNoLoad(ex);
  const loadRequired = showLoad && !isPower;
  const visibleSets = item.sets.filter((x) => x.status !== 'skipped');
  const setNo = visibleSets.indexOf(set) + 1;
  const qtyTitle = ex.unit === 'distance' ? 'Distance (m)' : ex.unit === 'time' ? 'Durée (s)' : 'Reps faites';
  const qtyStep = ex.unit === 'reps' ? 1 : 5;
  const phrase = intensityPhrase(item, set);
  const open = app.settings.exerciseCardOpen !== false;
  const target = set.rir;
  const last = set.last;

  main.innerHTML = `
    ${sessionHeader(app, session)}
    <div class="card">
      <div class="tier-band tier-${item.tier}" aria-hidden="true"></div>
      <div class="row">
        <div class="grow">
          <p class="small muted">${h(item.tier)} · ${h(TIER_LABELS[item.tier])}</p>
          <p class="ex-name">${h(ex.name)}</p>
          ${set.kind === 'top' ? '<p class="small"><strong>Série lourde</strong></p>' : ''}
          <p class="small">Série ${setNo} / ${visibleSets.length}${partner ? ` · <span class="pill">Superset ${step.round}${step.letter} · avec ${h(app.exercises[partner.exerciseId].name)}</span>` : ''}</p>
        </div>
        <div class="row">
          <button type="button" class="btn btn-orange btn-more" id="more" aria-label="Plus d’actions">...</button>
          <button type="button" class="btn btn-orange" id="fiche" aria-label="Fiche de l’exercice">Fiche</button>
        </div>
      </div>
    </div>

    <div>
      <div class="block-title">À faire</div>
      <div class="card todo">
        <div class="todo-cols">
          <div><div class="todo-val">${set.targetReps ?? '-'}</div><div class="todo-unit">${h(repsUnit(ex))}</div></div>
          <div><div class="todo-val">${showLoad ? h(fmtLoad(set.proposed, ex)) : '-'}</div><div class="todo-unit">${showLoad ? h(loadUnit(ex)) : 'sans charge'}</div></div>
          <div><div class="todo-val">${isPower ? 'Max' : target ? h(rirRangeText(target, app.settings)) : '-'}</div><div class="todo-unit">${isPower ? 'vitesse' : target ? (app.settings.rirDisplay === 'rpe' ? 'RPE' : 'en réserve') : ''}</div></div>
        </div>
        ${set.proposed == null && loadRequired ? '<p class="small center" style="margin-top:8px">Pas encore d’historique : choisis une charge prudente pour cette première série.</p>' : ''}
        ${set.source === 'reference' && set.proposed != null ? '<p class="small muted center" style="margin-top:6px">Charge calculée depuis ta charge de référence.</p>' : ''}
        ${set.guaranteed ? '<p class="small center" style="margin-top:6px"><span class="badge">+1 palier</span> haut de fourchette atteint la dernière fois</p>' : ''}
        <div class="last-time">
          ${last ? `<button type="button" class="btn btn-orange btn-block list-btn" id="copy-last" aria-label="Recopier les valeurs de la dernière fois">
            <span>Dernière fois${last.sameBlock ? '' : last.blockName ? ` (bloc ${h(last.blockName)})` : ''} : ${showLoad && last.load != null ? `${h(fmtLoad(last.load, ex))} kg x ` : ''}${last.reps ?? '?'}${last.rir != null ? `, ${h(rirLabel(last.rir, app.settings))}` : ''}</span><span>Recopier</span></button>`
            : '<p class="small muted">Dernière fois : première exposition.</p>'}
        </div>
      </div>
    </div>

    ${ex.cue || phrase ? `
    <div class="card collapsible">
      <button type="button" class="btn btn-orange toggle" id="toggle-card" aria-expanded="${open}"><span>L’exercice et l’intensité</span><span aria-hidden="true">${open ? '−' : '+'}</span></button>
      ${open ? `<div class="content small"><p>${h(ex.cue)}</p>${phrase ? `<p><strong>${h(phrase)}</strong></p>` : ''}${session.notes?.[item.slotId] ? `<p class="muted">Note : ${h(session.notes[item.slotId])}</p>` : ''}</div>` : ''}
    </div>` : ''}

    ${showLoad ? `
    <div>
      <div class="block-title">Poids utilisé</div>
      <div class="card">
        <div class="stepper">
          <button type="button" class="btn btn-red" id="load-minus" aria-label="Diminuer le poids">−</button>
          <button type="button" class="value" id="load-val" aria-label="Saisir le poids"><span>${h(fmtLoad(d.load, ex))}</span><span class="unit">${h(loadUnit(ex))}</span></button>
          <button type="button" class="btn btn-green" id="load-plus" aria-label="Augmenter le poids">+</button>
        </div>
      </div>
    </div>` : ''}

    <div>
      <div class="block-title">${h(qtyTitle)}</div>
      <div class="card">
        <div class="stepper">
          <button type="button" class="btn btn-red" id="reps-minus" aria-label="Diminuer">−</button>
          <button type="button" class="value" id="reps-val" aria-label="Saisir la valeur"><span>${d.reps ?? '-'}</span><span class="unit">${h(repsUnit(ex))}</span></button>
          <button type="button" class="btn btn-green" id="reps-plus" aria-label="Augmenter">+</button>
        </div>
      </div>
    </div>

    ${isPower ? `
    <div>
      <div class="block-title">Vitesse</div>
      <div class="card two-col">
        <button type="button" class="btn ${d.speed === 'ok' ? 'btn-selected' : 'btn-orange'}" data-speed="ok" aria-pressed="${d.speed === 'ok'}">Vitesse OK</button>
        <button type="button" class="btn ${d.speed === 'down' ? 'btn-selected' : 'btn-orange'}" data-speed="down" aria-pressed="${d.speed === 'down'}">Vitesse en baisse</button>
      </div>
    </div>` : ''}

    ${needsRir ? `
    <div>
      <div class="block-title">${app.settings.rirDisplay === 'rpe' ? 'RPE ressenti' : 'RIR ressenti'}</div>
      <div class="card">
        <div class="rir-grid" role="group" aria-label="Reps en réserve">
          ${RIR_OPTIONS.map((o) => {
            const inTarget = target && o.v >= Math.ceil(target[0]) && o.v <= Math.floor(target[1] + 1e-9);
            const sel = d.rir === o.v;
            const n = app.settings.rirDisplay === 'rpe' ? (o.v === 5 ? '5-' : String(10 - o.v)) : (o.v === 5 ? '5+' : String(o.v));
            return `<div class="rir-cell">
              <button type="button" class="btn ${sel ? 'btn-selected' : 'btn-orange'}" data-rir="${o.v}" aria-pressed="${sel}" aria-label="${h(o.full)}${inTarget ? ', cible' : ''}">
                <span class="n">${n}</span><span class="l">${h(o.short)}</span></button>
              ${inTarget ? '<div class="target-bar" aria-hidden="true"></div><div class="target-word" aria-hidden="true">cible</div>' : ''}
            </div>`;
          }).join('')}
        </div>
        <p class="rir-full" aria-live="polite">${d.rir != null ? h(RIR_OPTIONS[d.rir].full) : ''}</p>
      </div>
    </div>` : ''}

    <div class="sticky-bottom"><div class="inner">
      <p class="hint" id="hint" role="alert">${h(d.hint || '')}</p>
      <button type="button" class="btn btn-green btn-done" id="done">Fait</button>
    </div></div>`;

  bindSessionHeader(app, main);
  const rerender = () => app.go('set');
  const eq = ex.equipment;
  const st = app.settings.equipment;

  const changeLoad = (n) => {
    const base = d.load ?? set.proposed ?? 0;
    d.load = shiftLoad(base, n, eq, st);
    if (!(eq === 'weighted_bodyweight' || eq === 'bodyweight') && d.load < 0) d.load = 0;
    vibrate(15);
    main.querySelector('#load-val span').textContent = fmtLoad(d.load, ex);
  };
  const changeReps = (n) => {
    d.reps = Math.max(0, (d.reps ?? set.targetReps ?? 0) + n);
    vibrate(15);
    main.querySelector('#reps-val span').textContent = d.reps;
  };
  if (showLoad) {
    bindRepeat(main.querySelector('#load-minus'), () => changeLoad(-1));
    bindRepeat(main.querySelector('#load-plus'), () => changeLoad(1));
    main.querySelector('#load-val').addEventListener('click', async () => {
      const isBar = eq === 'barbell';
      const bar = app.settings.equipment.barWeight ?? 20;
      const v = await askNumber({
        title: 'Poids utilisé',
        value: d.load ?? set.proposed ?? '',
        unit: loadUnit(ex),
        allowNegative: eq === 'weighted_bodyweight' || eq === 'bodyweight',
        extraHtml: isBar ? `<div class="card"><div class="block-title">Disques par côté (barre de ${formatNumber(bar)} kg)</div><p id="plates"></p></div>` : '',
        onInput: isBar ? (val, el) => {
          const p = platesPerSide(val, bar);
          el.querySelector('#plates').textContent = !val ? '' : p == null ? 'Charge impossible à faire exactement avec les disques standard.' : p.length ? p.map((x) => formatNumber(x, 2)).join(' + ') : 'Barre seule';
        } : undefined,
      });
      if (v != null) { d.load = v; rerender(); }
    });
  }
  bindRepeat(main.querySelector('#reps-minus'), () => changeReps(-qtyStep));
  bindRepeat(main.querySelector('#reps-plus'), () => changeReps(qtyStep));
  main.querySelector('#reps-val').addEventListener('click', async () => {
    const v = await askNumber({ title: qtyTitle, value: d.reps ?? '', unit: repsUnit(ex), step: 1 });
    if (v != null) { d.reps = Math.round(v); rerender(); }
  });
  main.querySelectorAll('[data-rir]').forEach((b) => b.addEventListener('click', () => {
    d.rir = Number(b.dataset.rir);
    d.hint = '';
    vibrate(15);
    rerender();
  }));
  main.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    d.speed = b.dataset.speed;
    vibrate(15);
    rerender();
  }));
  const copy = main.querySelector('#copy-last');
  if (copy) copy.addEventListener('click', () => {
    if (last.load != null && showLoad) d.load = last.load;
    if (last.reps != null) d.reps = last.reps;
    if (last.rir != null && needsRir) d.rir = Math.min(5, Math.round(last.rir));
    vibrate(15);
    rerender();
  });
  const toggle = main.querySelector('#toggle-card');
  if (toggle) toggle.addEventListener('click', async () => {
    app.settings.exerciseCardOpen = !open;
    await db.saveSettings(app.settings);
    rerender();
  });
  main.querySelector('#fiche').addEventListener('click', () => app.go('exercise', { itemIndex: step.item, inSession: true, back: 'set' }));
  main.querySelector('#more').addEventListener('click', () => moreSheet(app, item, partner));

  const doneBtn = main.querySelector('#done');
  let busy = false;
  doneBtn.addEventListener('click', async () => {
    if (busy || (app.lastDoneAt && Date.now() - app.lastDoneAt < 1000)) return;
    const hint = main.querySelector('#hint');
    if (loadRequired && d.load == null) {
      d.hint = 'Indique le poids utilisé';
      hint.textContent = d.hint;
      vibrate([30, 40, 30]);
      return;
    }
    if (needsRir && d.rir == null) {
      d.hint = app.settings.rirDisplay === 'rpe' ? 'Sélectionne ton RPE ressenti' : 'Sélectionne ton RIR ressenti';
      hint.textContent = d.hint;
      vibrate([30, 40, 30]);
      return;
    }
    busy = true;
    app.lastDoneAt = Date.now();
    const result = await validateSet(app, { load: showLoad ? d.load : null, reps: d.reps, rir: needsRir ? d.rir : null, speed: isPower ? d.speed : null });
    doneBtn.classList.add('saved');
    doneBtn.innerHTML = '<span aria-hidden="true">✓</span> Enregistré';
    vibrate(120);
    app.lastResult = result;
    app.draft = null;
    setTimeout(() => {
      const onUndo = async () => {
        if (await undoLast(app)) {
          app.draft = null;
          app.go('set');
        }
      };
      if (result.finished) {
        app.lastEnded = app.session;
        app.go('congrats', { sessionId: app.session.id, keepToast: true });
      } else {
        app.go('rest', { keepToast: true });
      }
      showToast('Série enregistrée', { actionLabel: 'Annuler', onAction: onUndo, timeout: 5000 });
    }, 450);
  });
}

function moreSheet(app, item, partner) {
  const actions = [];
  if (partner) actions.push({ label: 'Faire séparément', kind: 'orange', onClick: async (close) => { close(); await splitCurrentPair(app); app.go('set'); } });
  actions.push({ label: 'Notes', kind: 'orange', onClick: (close) => { close(); notesSheet(app, item); } });
  actions.push({ label: 'Ajouter une série', kind: 'orange', onClick: async (close) => { close(); await addExtraSet(app); app.go('set'); } });
  actions.push({ label: 'Sauter cette série', kind: 'orange', onClick: async (close) => {
    close();
    const r = await skipCurrentSet(app);
    if (r.finished) {
      app.lastEnded = app.session;
      const s = app.session;
      app.session = null;
      app.go('summary', { sessionId: s.id });
    } else app.go('set');
  } });
  if (canUndo()) actions.push({ label: 'Annuler la dernière série validée', kind: 'orange', onClick: async (close) => { close(); if (await undoLast(app)) { app.draft = null; app.go('set'); } } });
  actions.push({ label: 'Fermer', kind: 'orange', onClick: (close) => close() });
  openSheet({ title: 'Actions', actions });
}

function notesSheet(app, item) {
  const s = app.session;
  const idx = s.items.indexOf(item);
  const sheet = openSheet({
    title: 'Notes',
    body: `<label class="field"><span class="sr-only">Note</span><textarea id="note">${h(s.notes?.[item.slotId] || '')}</textarea></label>`,
    actions: [
      { label: 'Enregistrer', kind: 'green', onClick: async (close) => { await saveNote(app, idx, sheet.el.querySelector('#note').value); close(); app.go('set'); } },
      { label: 'Annuler', kind: 'orange', onClick: (close) => close() },
    ],
  });
}
