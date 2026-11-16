// Rest screen: advised rest (no countdown), elapsed time from timestamps, load change, next set.

import { h, fmtLoad, loadUnit, repsUnit } from '../components.js';
import { restAfter, nextOpenStep } from '../../engine/session-flow.js';
import { formatRest, formatElapsed } from '../../engine/dates.js';
import { sessionHeader, bindSessionHeader } from './set.js';
import { stepsOf, goNext, stopPowerExercise } from '../session.js';

export async function renderRest(app, main) {
  const s = app.session;
  if (!s) return app.go('home');
  if (!s.rest) return app.go('set');
  const steps = stepsOf(s);
  const after = s.rest.afterStep;
  const seconds = restAfter(s.items, steps, after, app.program.superset);
  const nextIdx = nextOpenStep(s.items, steps, after);
  const next = nextIdx >= 0 ? steps[nextIdx] : null;
  const nItem = next ? s.items[next.item] : null;
  const nSet = next ? nItem.sets[next.set] : null;
  const nEx = nItem ? app.exercises[nItem.exerciseId] : null;
  const doneItem = s.items[steps[after].item];
  const doneSet = doneItem.sets[steps[after].set];
  const nVisible = nItem ? nItem.sets.filter((x) => x.status !== 'skipped') : [];

  main.innerHTML = `
    ${sessionHeader(app, s)}
    ${doneSet.pr ? '<div class="banner"><div class="grow">Record personnel battu sur cette série</div></div>' : ''}
    <div class="card">
      <div class="block-title">Repos</div>
      <p class="center">Repos conseillé</p>
      <p class="rest-big">${h(formatRest(seconds))}</p>
      <p class="center muted">Écoulé depuis la série : <span id="elapsed" class="chrono"></span></p>
    </div>
    ${s.rest.message ? `<div class="card"><div class="block-title">Ajustement de charge</div><p>${h(s.rest.message)}</p></div>` : ''}
    ${s.rest.speedDown ? `
      <div class="card">
        <div class="block-title">Vitesse en baisse</div>
        <p>Arrêter l’exercice ici ? Les séries restantes seront marquées non faites, sans pénalité.</p>
        <button type="button" class="btn btn-orange btn-block" id="stop-ex">Arrêter l’exercice ici</button>
      </div>` : ''}
    ${next ? `
      <div class="card">
        <div class="block-title">Prochaine série</div>
        <p class="ex-name">${h(nEx.name)}</p>
        <p>Série ${nVisible.indexOf(nSet) + 1} / ${nVisible.length}${nSet.kind === 'top' ? ' · série lourde' : ''}</p>
        <p>${nSet.targetReps ?? '-'} ${h(repsUnit(nEx))}${nSet.proposed != null ? ` · ${h(fmtLoad(nSet.proposed, nEx))} ${h(loadUnit(nEx))}` : ''}</p>
      </div>` : ''}
    <div class="sticky-bottom"><div class="inner">
      <button type="button" class="btn btn-green btn-done" id="next">Série suivante</button>
    </div></div>`;

  bindSessionHeader(app, main);
  const el = main.querySelector('#elapsed');
  const t0 = new Date(s.rest.at).getTime();
  const tick = () => { el.textContent = formatElapsed(Date.now() - t0); };
  tick();
  app.timers.push(setInterval(tick, 1000));
  main.querySelector('#next').addEventListener('click', async () => {
    if (await goNext(app)) app.go('set', { keepToast: true });
    else app.go('home');
  });
  const stopEx = main.querySelector('#stop-ex');
  if (stopEx) stopEx.addEventListener('click', async () => {
    const r = await stopPowerExercise(app);
    if (r.finished) {
      const ended = app.session;
      app.lastEnded = ended;
      app.go('congrats', { sessionId: ended.id });
    } else app.go('rest');
  });
}
