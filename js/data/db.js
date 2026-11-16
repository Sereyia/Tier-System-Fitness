// IndexedDB access: versioned schema with migrations, small promise helpers, repository functions.

import { SEED_EXERCISES, SEED_PROGRAM, SEED_CORRESPONDENCES, DEFAULT_SETTINGS } from './seed.js';
import { localIso } from '../engine/dates.js';

export const DB_NAME = 'muscu';
export const SCHEMA_VERSION = 1;

export const STORES = [
  'meta', 'exercises', 'programs', 'cycles', 'sessions', 'sets', 'references',
  'bodyweight', 'correspondences', 'cycleTemplates', 'snapshots',
];

/**
 * Schema migrations. MIGRATIONS[n] upgrades the database from version n - 1 to n.
 * Never edit a released migration: add a new one and bump SCHEMA_VERSION.
 */
export const MIGRATIONS = {
  1(db) {
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('exercises', { keyPath: 'id' });
    db.createObjectStore('programs', { keyPath: 'id' });
    const cycles = db.createObjectStore('cycles', { keyPath: 'id' });
    cycles.createIndex('startedAt', 'startedAt');
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('startedAt', 'startedAt');
    sessions.createIndex('cycleId', 'cycleId');
    sessions.createIndex('status', 'status');
    const sets = db.createObjectStore('sets', { keyPath: 'id' });
    sets.createIndex('sessionId', 'sessionId');
    sets.createIndex('exerciseId', 'exerciseId');
    sets.createIndex('exerciseDate', ['exerciseId', 'date']);
    db.createObjectStore('references', { keyPath: 'exerciseId' });
    db.createObjectStore('bodyweight', { keyPath: 'date' });
    db.createObjectStore('correspondences', { keyPath: 'id' });
    db.createObjectStore('cycleTemplates', { keyPath: 'id' });
    const snaps = db.createObjectStore('snapshots', { keyPath: 'id' });
    snaps.createIndex('createdAt', 'createdAt');
  },
};

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      for (let v = ev.oldVersion + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v](db, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet'));
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run fn(tx) in one transaction; resolves after commit. */
export async function withTx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    Promise.resolve(fn(tx)).then((r) => { result = r; }, (e) => { try { tx.abort(); } catch { /* already done */ } reject(e); });
  });
}

export async function get(store, key) {
  return withTx([store], 'readonly', (tx) => reqP(tx.objectStore(store).get(key)));
}

export async function getAll(store) {
  return withTx([store], 'readonly', (tx) => reqP(tx.objectStore(store).getAll()));
}

export async function getAllByIndex(store, index, query) {
  return withTx([store], 'readonly', (tx) => reqP(tx.objectStore(store).index(index).getAll(query)));
}

export async function put(store, value) {
  return withTx([store], 'readwrite', (tx) => reqP(tx.objectStore(store).put(value)));
}

export async function del(store, key) {
  return withTx([store], 'readwrite', (tx) => reqP(tx.objectStore(store).delete(key)));
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Repository ----------

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}

export async function setMeta(key, value) {
  return put('meta', { key, value });
}

export async function getSettings() {
  const s = await getMeta('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    equipment: {
      ...DEFAULT_SETTINGS.equipment,
      ...(s.equipment || {}),
      steps: { ...DEFAULT_SETTINGS.equipment.steps, ...(s.equipment?.steps || {}) },
    },
  };
}

export async function saveSettings(settings) {
  return setMeta('settings', settings);
}

export const DEFAULT_STATE = {
  onboardingDone: false,
  programId: 'default',
  rotationIndex: 0,
  currentCycleId: null,
  activeSessionId: null,
  lastExportAt: null,
  installedAt: null,
  lastBodyweightPromptAt: null,
};

export async function getState() {
  return { ...DEFAULT_STATE, ...(await getMeta('state', {})) };
}

export async function saveState(patch) {
  const s = await getState();
  const next = { ...s, ...patch };
  await setMeta('state', next);
  return next;
}

/** First launch: load the seed program, library and correspondences. Idempotent. */
export async function ensureSeed() {
  const existing = await get('programs', 'default');
  if (existing) return false;
  const now = localIso();
  const cycleId = newId();
  await withTx(['meta', 'exercises', 'programs', 'correspondences', 'cycles'], 'readwrite', (tx) => {
    for (const e of SEED_EXERCISES) tx.objectStore('exercises').put(e);
    tx.objectStore('programs').put(SEED_PROGRAM);
    for (const c of SEED_CORRESPONDENCES) tx.objectStore('correspondences').put({ ...c, estimate: true });
    tx.objectStore('cycles').put({ id: cycleId, number: 1, name: 'Cycle 1', rotations: DEFAULT_SETTINGS.cycleRotations, startedAt: now, endedAt: null, programId: 'default', status: 'active' });
    tx.objectStore('meta').put({ key: 'schema', value: SCHEMA_VERSION });
    tx.objectStore('meta').put({ key: 'settings', value: DEFAULT_SETTINGS });
    tx.objectStore('meta').put({ key: 'state', value: { ...DEFAULT_STATE, currentCycleId: cycleId, installedAt: now } });
  });
  return true;
}

export async function getProgram(id = 'default') {
  return get('programs', id);
}

export async function getExercisesById() {
  const list = await getAll('exercises');
  return Object.fromEntries(list.map((e) => [e.id, e]));
}

export async function getReferences() {
  const list = await getAll('references');
  return Object.fromEntries(list.map((r) => [r.exerciseId, r]));
}

export async function setReference(exerciseId, load, source = 'user') {
  return put('references', { exerciseId, load, source, updatedAt: localIso() });
}

export async function latestBodyweight() {
  const list = await getAll('bodyweight');
  if (!list.length) return null;
  list.sort((a, b) => (a.date < b.date ? 1 : -1));
  return list[0];
}

export async function addBodyweight(kg) {
  return put('bodyweight', { date: localIso(), kg });
}

export async function getSession(id) {
  return get('sessions', id);
}

export async function saveSession(session) {
  return put('sessions', session);
}

export async function allSessions() {
  const list = await getAll('sessions');
  return list.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/** One transaction per validated set: the set record and the session state together. */
export async function saveSetWithSession(record, session) {
  return withTx(['sets', 'sessions'], 'readwrite', (tx) => {
    tx.objectStore('sets').put(record);
    tx.objectStore('sessions').put(session);
  });
}

export async function deleteSetWithSession(recordId, session) {
  return withTx(['sets', 'sessions'], 'readwrite', (tx) => {
    tx.objectStore('sets').delete(recordId);
    tx.objectStore('sessions').put(session);
  });
}

/**
 * Past sessions of one exercise, most recent first, in the shape used by the load engine:
 * [{ sessionId, date, blockId, blockType, coef, sets }]
 */
export async function exerciseHistory(exerciseId, excludeSessionId = null) {
  const sets = await getAllByIndex('sets', 'exerciseId', exerciseId);
  const bySession = new Map();
  for (const s of sets) {
    if (s.sessionId === excludeSessionId) continue;
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, { sessionId: s.sessionId, date: s.date, blockId: s.blockId, blockType: s.blockType, coef: s.coef, sets: [] });
    const h = bySession.get(s.sessionId);
    h.sets.push(s);
    if (s.date < h.date) h.date = s.date;
  }
  const list = [...bySession.values()];
  for (const h of list) h.sets.sort((a, b) => (a.date < b.date ? -1 : 1));
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function allSets() {
  return getAll('sets');
}

export async function getCycle(id) {
  return get('cycles', id);
}

/** Dump every store except snapshots. */
export async function dumpAll() {
  const out = {};
  await withTx(STORES.filter((s) => s !== 'snapshots'), 'readonly', async (tx) => {
    for (const s of STORES) {
      if (s === 'snapshots') continue;
      out[s] = await reqP(tx.objectStore(s).getAll());
    }
  });
  return out;
}

/** Replace all data stores (not snapshots) in one transaction. */
export async function replaceAll(data) {
  const names = STORES.filter((s) => s !== 'snapshots');
  return withTx(names, 'readwrite', (tx) => {
    for (const s of names) {
      const store = tx.objectStore(s);
      store.clear();
      for (const v of data[s] || []) store.put(v);
    }
  });
}

export const MAX_SNAPSHOTS = 5;

/** Internal rotating backup (last 5). Does not protect against clearing browser data. */
export async function createSnapshot(reason) {
  const data = await dumpAll();
  const snap = { id: newId(), createdAt: localIso(), reason, data };
  await withTx(['snapshots'], 'readwrite', async (tx) => {
    const store = tx.objectStore('snapshots');
    store.put(snap);
    const all = await reqP(store.getAll());
    all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    for (const old of all.slice(MAX_SNAPSHOTS)) store.delete(old.id);
  });
  return snap;
}

export async function listSnapshots() {
  const all = await getAll('snapshots');
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
