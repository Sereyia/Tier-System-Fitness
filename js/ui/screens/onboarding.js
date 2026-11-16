// First launch assistant: body weight, T1 reference loads, installation and backup explanation.

import * as db from '../../data/db.js';
import { t1ExerciseIds, referenceBlock } from '../../engine/program.js';
import { h, loadUnit } from '../components.js';
import { roundLoad } from '../../engine/load.js';

export async function renderOnboarding(app, main, params) {
  const step = params.step || 1;
  if (step === 1) return stepWelcome(app, main);
  if (step === 2) return stepBodyweight(app, main);
  if (step === 3) return stepReferences(app, main);
  return stepInstall(app, main);
}

function nav(main, html) {
  main.innerHTML = html;
}

function stepWelcome(app, main) {
  nav(main, `
    <h1>Bienvenue</h1>
    <div class="card">
      <p>Cette appli fait tourner un programme de musculation en salle, série par série, sans connexion.</p>
      <p class="muted">Tes données restent uniquement sur ce téléphone. Aucun compte, aucun envoi.</p>
    </div>
    <div class="card">
      <label class="field"><span>Prénom (facultatif, affiché sur l’accueil)</span>
        <input type="text" id="first" autocomplete="given-name" value="${h(app.settings.firstName || '')}">
      </label>
    </div>
    <p class="muted small">Étape 1 sur 4</p>
    <button type="button" class="btn btn-green btn-block btn-big" id="next">Continuer</button>`);
  main.querySelector('#next').addEventListener('click', async () => {
    app.settings.firstName = main.querySelector('#first').value.trim();
    await db.saveSettings(app.settings);
    app.go('onboarding', { step: 2 });
  });
}

function stepBodyweight(app, main) {
  nav(main, `
    <h1>Poids de corps</h1>
    <div class="card">
      <p>Il sert à calculer la charge des exercices au poids du corps lestés (tractions, dips).</p>
      <label class="field"><span>Poids de corps (kg)</span>
        <input class="big-input" type="number" inputmode="decimal" min="20" max="300" step="0.1" id="bw" value="${app.bodyweight ?? ''}">
      </label>
      <p class="hint" id="err" role="alert"></p>
    </div>
    <p class="muted small">Étape 2 sur 4</p>
    <button type="button" class="btn btn-green btn-block btn-big" id="next">Continuer</button>`);
  main.querySelector('#next').addEventListener('click', async () => {
    const v = Number(main.querySelector('#bw').value.replace(',', '.'));
    if (!v || v < 20 || v > 300) {
      main.querySelector('#err').textContent = 'Indique ton poids de corps en kg.';
      return;
    }
    await db.addBodyweight(v);
    app.bodyweight = v;
    app.state = await db.saveState({ lastBodyweightPromptAt: new Date().toISOString() });
    app.go('onboarding', { step: 3 });
  });
}

async function stepReferences(app, main) {
  const ids = t1ExerciseIds(app.program);
  const refs = await db.getReferences();
  const ref = referenceBlock(app.program);
  const t1 = ref.tiers.T1;
  const rows = ids.map((id) => {
    const e = app.exercises[id];
    const isBw = e.equipment === 'weighted_bodyweight';
    return `
      <label class="field card">
        <span><strong>${h(e.name)}</strong> <span class="muted small">(${h(loadUnit(e))}${e.perSide ? ', reps par côté' : ''})</span></span>
        <input type="number" inputmode="decimal" step="0.5" ${isBw ? '' : 'min="0"'} data-id="${id}" value="${refs[id]?.load ?? ''}" placeholder="${isBw ? '0 si sans lest' : 'Vide si tu ne sais pas'}">
      </label>`;
  }).join('');
  nav(main, `
    <h1>Charges de référence</h1>
    <div class="card">
      <p>Pour chaque exercice principal, indique la charge avec laquelle tu ferais environ ${t1.reps ? Math.round((t1.reps[0] + t1.reps[1]) / 2) : 6} reps en gardant ${t1.rir ? `${t1.rir[0]} à ${t1.rir[1]}` : '2 à 3'} reps en réserve (bloc ${h(ref.name)}).</p>
      <p class="muted small">Haltères : charge d’un seul haltère. Tractions : lest ajouté (0 sans lest, négatif avec assistance). Laisse vide si tu ne sais pas : la charge sera demandée à la première séance. Les autres exercices seront demandés au fil des séances.</p>
    </div>
    ${rows}
    <p class="muted small">Étape 3 sur 4</p>
    <button type="button" class="btn btn-green btn-block btn-big" id="next">Continuer</button>`);
  main.querySelector('#next').addEventListener('click', async () => {
    for (const input of main.querySelectorAll('input[data-id]')) {
      const raw = input.value.replace(',', '.').trim();
      if (raw === '') continue;
      const v = Number(raw);
      if (Number.isNaN(v)) continue;
      const e = app.exercises[input.dataset.id];
      await db.setReference(e.id, roundLoad(v, e.equipment, app.settings.equipment), 'onboarding');
    }
    app.go('onboarding', { step: 4 });
  });
}

function stepInstall(app, main) {
  nav(main, `
    <h1>Avant de commencer</h1>
    <div class="card">
      <h2>Installer l’appli</h2>
      <p>Android (Chrome) : menu en haut à droite, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>
      <p>iPhone (Safari) : bouton Partager, puis « Sur l’écran d’accueil ». Sur iPhone, c’est indispensable pour que les données soient conservées durablement.</p>
    </div>
    <div class="card">
      <h2>Sauvegarder ses données</h2>
      <p>Tout est stocké sur ce téléphone. Vider les données du navigateur ou désinstaller l’appli efface l’historique.</p>
      <p>Exporte régulièrement ta sauvegarde (Réglages, « Exporter ma sauvegarde ») vers Google Drive, un e-mail ou une messagerie. L’accueil te le rappelle après 7 jours sans export.</p>
    </div>
    <p class="muted small">Étape 4 sur 4</p>
    <button type="button" class="btn btn-green btn-block btn-big" id="done">Commencer</button>`);
  main.querySelector('#done').addEventListener('click', async () => {
    app.state = await db.saveState({ onboardingDone: true });
    app.go('home');
  });
}
