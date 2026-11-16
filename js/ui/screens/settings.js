// Settings: profile, display, session options, rests, equipment steps, storage, backup export and import.

import * as db from '../../data/db.js';
import { buildBackup, parseBackup, shareOrDownload } from '../../data/backup.js';
import { h, openSheet, askNumber, showToast } from '../components.js';
import { formatNumber, formatDateFull, localIso } from '../../engine/dates.js';
import { APP_VERSION } from '../app.js';

export async function exportBackupFlow(app) {
  const data = await db.dumpAll();
  const backup = buildBackup(data, { schemaVersion: db.SCHEMA_VERSION, appVersion: APP_VERSION });
  const result = await shareOrDownload(backup);
  if (result !== 'cancelled') {
    app.state = await db.saveState({ lastExportAt: localIso() });
    showToast(result === 'shared' ? 'Sauvegarde partagée' : 'Sauvegarde téléchargée', { timeout: 3000 });
  }
  return result;
}

export async function bodyweightFlow(app) {
  const v = await askNumber({ title: 'Poids de corps', value: app.bodyweight ?? '', unit: 'kg', step: 0.1 });
  if (v != null && v >= 20 && v <= 300) {
    await db.addBodyweight(v);
    app.bodyweight = v;
  }
  app.state = await db.saveState({ lastBodyweightPromptAt: new Date().toISOString() });
}

function importFlow(app) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let backup;
    try {
      backup = parseBackup(await file.text());
    } catch (e) {
      openSheet({ title: 'Import impossible', body: `<p>${h(e.message)}</p>`, actions: [{ label: 'Fermer', kind: 'orange', onClick: (c) => c() }] });
      return;
    }
    const n = backup.data.sessions?.length || 0;
    openSheet({
      title: 'Importer cette sauvegarde ?',
      body: `<p>L’import <strong>remplace toutes les données actuelles</strong> par celles du fichier (${n} séance${n > 1 ? 's' : ''}, exportée le ${h(formatDateFull(backup.exportedAt))}).</p>
        <p class="muted">Une sauvegarde interne des données actuelles est faite juste avant.</p>`,
      actions: [
        { label: 'Maintenir pour importer', kind: 'orange', hold: true, onClick: async (close) => {
          await db.createSnapshot('avant import');
          await db.replaceAll(backup.data);
          close();
          await app.reload();
          showToast('Sauvegarde importée', { timeout: 3000 });
        } },
        { label: 'Annuler', kind: 'orange', onClick: (close) => close() },
      ],
    });
  });
  input.click();
}

async function snapshotsFlow(app) {
  const snaps = await db.listSnapshots();
  openSheet({
    title: 'Sauvegardes internes',
    body: '<p class="muted">Les 5 dernières, faites automatiquement avant un import ou une restauration. Elles ne protègent pas d’un effacement des données du navigateur.</p>',
    actions: snaps.map((s) => ({
      label: `${formatDateFull(s.createdAt)} ${s.createdAt.slice(11, 16)} · ${s.reason}`,
      kind: 'orange',
      onClick: (close) => {
        close();
        openSheet({
          title: 'Restaurer cette sauvegarde interne ?',
          body: '<p>Les données actuelles seront remplacées. Elles sont d’abord sauvegardées en interne.</p>',
          actions: [
            { label: 'Maintenir pour restaurer', kind: 'orange', hold: true, onClick: async (c) => {
              await db.createSnapshot('avant restauration');
              await db.replaceAll(s.data);
              c();
              await app.reload();
            } },
            { label: 'Annuler', kind: 'orange', onClick: (c) => c() },
          ],
        });
      },
    })).concat([{ label: 'Fermer', kind: 'orange', onClick: (c) => c() }]),
  });
}

function toggle(id, label, on) {
  return `<div class="switch-row"><span>${h(label)}</span>
    <button type="button" class="btn ${on ? 'btn-selected' : 'btn-orange'}" data-toggle="${id}" aria-pressed="${on}">${on ? 'Activé' : 'Désactivé'}</button></div>`;
}

function numRow(id, label, value, unit) {
  return `<div class="switch-row"><span>${h(label)}</span>
    <button type="button" class="btn btn-orange" data-num="${id}" aria-label="${h(label)} : ${formatNumber(value, 2)} ${h(unit)}">${formatNumber(value, 2)} ${h(unit)}</button></div>`;
}

export async function renderSettings(app, main) {
  const st = app.settings;
  const eq = st.equipment;
  const ss = app.program.superset;
  let persisted = app.persisted;
  try { if (navigator.storage?.persisted) persisted = await navigator.storage.persisted(); } catch { /* ignore */ }
  main.innerHTML = `
    <h1>Réglages</h1>
    <div class="card">
      <div class="block-title">Profil</div>
      <div class="switch-row"><span>Prénom${st.firstName ? ` : ${h(st.firstName)}` : ' (facultatif)'}</span><button type="button" class="btn btn-orange" id="first">Modifier</button></div>
      <div class="switch-row"><span>Poids de corps : ${app.bodyweight != null ? `${formatNumber(app.bodyweight)} kg` : 'non renseigné'}</span><button type="button" class="btn btn-orange" id="bw">Modifier</button></div>
    </div>
    <div class="card">
      <div class="block-title">Séance</div>
      <div class="switch-row"><span>Affichage de l’effort</span>
        <div class="row">
          <button type="button" class="btn ${st.rirDisplay !== 'rpe' ? 'btn-selected' : 'btn-orange'}" data-rirmode="rir" aria-pressed="${st.rirDisplay !== 'rpe'}">RIR</button>
          <button type="button" class="btn ${st.rirDisplay === 'rpe' ? 'btn-selected' : 'btn-orange'}" data-rirmode="rpe" aria-pressed="${st.rirDisplay === 'rpe'}">RPE</button>
        </div></div>
      ${toggle('wakeLock', 'Écran maintenu allumé pendant la séance', st.wakeLock !== false)}
      ${toggle('vibration', 'Vibrations', st.vibration !== false)}
      ${toggle('repeatPartial', 'Reproposer une séance partielle la fois suivante', !!st.repeatPartial)}
      ${numRow('sessionsPerWeek', 'Séances prévues par semaine', st.sessionsPerWeek || 3, '')}
    </div>
    <div class="card">
      <div class="block-title">Repos en superset</div>
      ${numRow('shortRest', 'Repos court entre les 2 exercices (15 à 30 s)', ss.shortRest, 's')}
      ${numRow('longRestT1', 'Repos long après une paire avec un T1', ss.longRestT1, 's')}
      ${numRow('longRest', 'Repos long après une autre paire', ss.longRest, 's')}
    </div>
    <div class="card">
      <div class="block-title">Paliers du matériel</div>
      ${numRow('barbell', 'Barre', eq.steps.barbell, 'kg')}
      ${numRow('barWeight', 'Poids de la barre (calculateur de disques)', eq.barWeight ?? 20, 'kg')}
      ${numRow('dumbbell', 'Haltères', eq.steps.dumbbell, 'kg')}
      ${numRow('machine', 'Machines', eq.steps.machine, 'kg')}
      ${numRow('cable', 'Poulies', eq.steps.cable, 'kg')}
      ${numRow('weighted_bodyweight', 'Lest (poids du corps lesté)', eq.steps.weighted_bodyweight, 'kg')}
      <div class="switch-row"><span>Kettlebells : ${h(eq.kettlebells.join(', '))} kg</span><button type="button" class="btn btn-orange" id="kb">Modifier</button></div>
    </div>
    <div class="card">
      <div class="block-title">Données et sauvegarde</div>
      <p>Stockage persistant : <strong>${persisted === true ? 'oui' : persisted === false ? 'non' : 'inconnu'}</strong>${persisted === true ? '' : ' (le navigateur peut effacer les données en cas de manque de place)'}</p>
      <p>Dernier export : ${app.state.lastExportAt ? h(formatDateFull(app.state.lastExportAt)) : 'jamais'}</p>
      <p class="small"><strong>Attention :</strong> vider les données du navigateur ou désinstaller l’appli efface l’historique. Seule la sauvegarde exportée le protège.</p>
      <div class="list">
        <button type="button" class="btn btn-orange btn-block" id="export">Exporter ma sauvegarde</button>
        <button type="button" class="btn btn-orange btn-block" id="import">Importer une sauvegarde</button>
        <button type="button" class="btn btn-orange btn-block" id="snaps">Sauvegardes internes</button>
      </div>
    </div>
    <p class="muted small center">Version ${h(APP_VERSION)} · données locales uniquement</p>`;

  const save = async () => { await db.saveSettings(app.settings); app.applySettings(); };
  main.querySelector('#first').addEventListener('click', () => {
    const sheet = openSheet({
      title: 'Prénom',
      body: `<label class="field"><span class="sr-only">Prénom</span><input type="text" id="fn" value="${h(st.firstName || '')}"></label>`,
      actions: [
        { label: 'Enregistrer', kind: 'green', onClick: async (c) => { st.firstName = sheet.el.querySelector('#fn').value.trim(); await save(); c(); app.go('settings'); } },
        { label: 'Annuler', kind: 'orange', onClick: (c) => c() },
      ],
    });
  });
  main.querySelector('#bw').addEventListener('click', async () => { await bodyweightFlow(app); app.go('settings'); });
  main.querySelectorAll('[data-rirmode]').forEach((b) => b.addEventListener('click', async () => { st.rirDisplay = b.dataset.rirmode; await save(); app.go('settings'); }));
  main.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.toggle;
    st[k] = k === 'repeatPartial' ? !st[k] : st[k] === false;
    await save();
    app.go('settings');
  }));
  main.querySelectorAll('[data-num]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.num;
    const isRest = ['shortRest', 'longRest', 'longRestT1'].includes(k);
    const current = isRest ? ss[k] : k === 'barWeight' ? (eq.barWeight ?? 20) : k === 'sessionsPerWeek' ? (st.sessionsPerWeek || 3) : eq.steps[k];
    const v = await askNumber({ title: b.closest('.switch-row').querySelector('span').textContent, value: current, unit: isRest ? 's' : k === 'sessionsPerWeek' ? '' : 'kg' });
    if (v == null || v <= 0) return;
    if (isRest) {
      app.program.superset[k] = k === 'shortRest' ? Math.min(30, Math.max(15, Math.round(v))) : Math.round(v);
      await db.put('programs', app.program);
    } else if (k === 'barWeight') eq.barWeight = v;
    else if (k === 'sessionsPerWeek') st.sessionsPerWeek = Math.round(v);
    else eq.steps[k] = v;
    if (k === 'weighted_bodyweight') eq.steps.bodyweight = v;
    await save();
    app.go('settings');
  }));
  main.querySelector('#kb').addEventListener('click', () => {
    const sheet = openSheet({
      title: 'Kettlebells disponibles',
      body: `<label class="field"><span>Poids séparés par des virgules ou des espaces (kg)</span><input type="text" id="kbl" value="${h(eq.kettlebells.join(' '))}"></label>`,
      actions: [
        { label: 'Enregistrer', kind: 'green', onClick: async (c) => {
          const list = sheet.el.querySelector('#kbl').value.split(/[\s;,]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0).sort((a, b) => a - b);
          if (list.length) { eq.kettlebells = [...new Set(list)]; await save(); }
          c();
          app.go('settings');
        } },
        { label: 'Annuler', kind: 'orange', onClick: (c) => c() },
      ],
    });
  });
  main.querySelector('#export').addEventListener('click', async () => { await exportBackupFlow(app); app.go('settings', { keepToast: true }); });
  main.querySelector('#import').addEventListener('click', () => importFlow(app));
  main.querySelector('#snaps').addEventListener('click', () => snapshotsFlow(app));
}
