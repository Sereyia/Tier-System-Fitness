// JSON backup: versioned format, validation, migration, export and import.
// The pure functions (build, validate, migrate, file name) are tested with node --test.

import { localDate, localIso } from '../engine/dates.js';

export const BACKUP_FORMAT = 'muscu-backup';
export const BACKUP_FORMAT_VERSION = 1;

export const DATA_STORES = [
  'meta', 'exercises', 'programs', 'cycles', 'sessions', 'sets', 'references',
  'bodyweight', 'correspondences', 'cycleTemplates',
];

export function backupFileName(d = new Date()) {
  return `sauvegarde-muscu-${localDate(d)}.json`;
}

export function buildBackup(data, { schemaVersion, appVersion, now = new Date() } = {}) {
  const payload = {};
  for (const s of DATA_STORES) payload[s] = Array.isArray(data[s]) ? data[s] : [];
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion,
    appVersion,
    exportedAt: localIso(now),
    data: payload,
  };
}

/**
 * Backup migrations. BACKUP_MIGRATIONS[n] upgrades a backup from format n - 1 to n.
 * Version 1 is the first format: nothing to migrate yet.
 */
export const BACKUP_MIGRATIONS = {};

export function migrateBackup(backup) {
  let b = backup;
  for (let v = (b.formatVersion || 1) + 1; v <= BACKUP_FORMAT_VERSION; v++) {
    b = BACKUP_MIGRATIONS[v](b);
    b.formatVersion = v;
  }
  return b;
}

/** Throws an Error with a French message if the file is not a usable backup. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Fichier illisible : ce n’est pas une sauvegarde.');
  if (obj.format !== BACKUP_FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde de l’appli.');
  if (!Number.isInteger(obj.formatVersion) || obj.formatVersion < 1) throw new Error('Version de sauvegarde inconnue.');
  if (obj.formatVersion > BACKUP_FORMAT_VERSION) throw new Error('Sauvegarde créée par une version plus récente de l’appli : mets l’appli à jour avant d’importer.');
  if (!obj.data || typeof obj.data !== 'object') throw new Error('Sauvegarde incomplète : données absentes.');
  for (const s of DATA_STORES) {
    if (obj.data[s] != null && !Array.isArray(obj.data[s])) throw new Error(`Sauvegarde invalide : rubrique ${s}.`);
  }
  if (!obj.data.programs?.length) throw new Error('Sauvegarde incomplète : aucun programme.');
  if (!obj.data.exercises?.length) throw new Error('Sauvegarde incomplète : aucun exercice.');
  return true;
}

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Fichier illisible : JSON invalide.');
  }
  validateBackup(obj);
  return migrateBackup(obj);
}

/** Export: Web Share with a file when available (Android share sheet), download otherwise. */
export async function shareOrDownload(backup) {
  const name = backupFileName();
  const text = JSON.stringify(backup, null, 1);
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
