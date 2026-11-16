// End of session: congratulations screen, then summary.

import * as db from '../../data/db.js';
import { h, vibrate } from '../components.js';
import { MUSCLES } from '../../data/seed.js';
import { formatNumber } from '../../engine/dates.js';
import { summaryOf, saveFatigue, prText } from '../session.js';

async function endedSession(app, params) {
  if (app.lastEnded && app.lastEnded.id === params.sessionId) return db.getSession(params.sessionId);
  return params.sessionId ? db.getSession(params.sessionId) : null;
}

export async function renderCongrats(app, main, params) {
  const s = await endedSession(app, params);
  if (!s) return app.go('home');
  app.session = null;
  const sum = await summaryOf(app, s);
  main.innerHTML = `
    <div class="full-screen">
      <p class="big">Bravo, tu as fini ta séance !</p>
      ${sum.prs.length ? `<div class="card"><div class="block-title">Records du jour</div>${sum.prs.map((p) => `<p>${h(prText(p))}</p>`).join('')}</div>` : ''}
      <button type="button" class="btn btn-green btn-block btn-big" id="sum">Voir le résumé</button>
    </div>`;
  vibrate([120, 80, 120, 80, 300]);
  main.querySelector('#sum').addEventListener('click', () => app.go('summary', { sessionId: s.id }));
}

export async function renderSummary(app, main, params) {
  const s = await endedSession(app, params);
  if (!s) return app.go('home');
  app.session = null;
  const sum = await summaryOf(app, s);
  const vol = Object.entries(sum.volume).sort((a, b) => b[1] - a[1]);
  main.innerHTML = `
    <h1>Résumé de séance</h1>
    <p class="muted">${h(s.blockName)} · ${h(s.sessionName)}${s.status === 'partial' ? ' · séance partielle' : ''}</p>
    <div class="tiles">
      <div class="tile"><div class="v">${sum.minutes}</div><div class="k">minutes</div></div>
      <div class="tile"><div class="v">${sum.sets}</div><div class="k">séries</div></div>
      <div class="tile"><div class="v">${formatNumber(sum.tonnage, 0)}</div><div class="k">kg de tonnage</div></div>
    </div>
    ${sum.prs.length ? `<div class="card"><div class="block-title">Records</div>${sum.prs.map((p) => `<p>${h(prText(p))}</p>`).join('')}</div>` : ''}
    <div class="card"><div class="block-title">Volume par muscle (séries)</div>
      ${vol.length ? vol.map(([m, v]) => `<div class="line"><span>${h(MUSCLES[m] || m)}</span><span>${formatNumber(v)}</span></div>`).join('') : '<p class="muted">Aucune série enregistrée.</p>'}
      <p class="muted small">1 pour une série directe, 0,5 pour une série indirecte.</p>
    </div>
    <div class="card">
      <div class="block-title">Fatigue élevée ?</div>
      <div class="two-col">
        <button type="button" class="btn ${s.fatigue === true ? 'btn-selected' : 'btn-orange'}" data-f="yes" aria-pressed="${s.fatigue === true}">Oui</button>
        <button type="button" class="btn ${s.fatigue === false ? 'btn-selected' : 'btn-orange'}" data-f="no" aria-pressed="${s.fatigue === false}">Non</button>
      </div>
    </div>
    <div class="sticky-bottom"><div class="inner">
      <button type="button" class="btn btn-green btn-done" id="home">Terminer</button>
    </div></div>`;
  main.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', async () => {
    await saveFatigue(s, b.dataset.f === 'yes');
    app.go('summary', { sessionId: s.id });
  }));
  main.querySelector('#home').addEventListener('click', () => {
    app.lastEnded = null;
    app.go('home');
  });
}
