import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, validateBackup, backupFileName, DATA_STORES } from '../js/data/backup.js';
import { SEED_PROGRAM, SEED_EXERCISES } from '../js/data/seed.js';
import { localIso, formatRest, formatElapsed, formatNumber } from '../js/engine/dates.js';

const sample = () => ({
  meta: [{ key: 'state', value: { rotationIndex: 3 } }],
  exercises: SEED_EXERCISES,
  programs: [SEED_PROGRAM],
  sessions: [{ id: 's1', status: 'partial', startedAt: '2026-11-16T09:00:00+01:00' }],
  sets: [{ id: 'x', sessionId: 's1', exerciseId: 'squat', load: 100, reps: 5, rir: 2 }],
  snapshots: [{ id: 'should-not-be-exported' }],
});

test('backup file name carries the date', () => {
  assert.equal(backupFileName(new Date(2026, 10, 16, 23, 59)), 'sauvegarde-muscu-2026-11-16.json');
});

test('export then import round trip keeps all data', () => {
  const b = buildBackup(sample(), { schemaVersion: 1, appVersion: '1.0.0' });
  assert.deepEqual(Object.keys(b.data).sort(), [...DATA_STORES].sort());
  assert.equal(b.data.snapshots, undefined);
  const back = parseBackup(JSON.stringify(b));
  assert.deepEqual(back.data.sets, sample().sets);
  assert.deepEqual(back.data.sessions, sample().sessions);
  assert.deepEqual(back.data.programs[0], SEED_PROGRAM);
});

test('invalid backups are rejected with a clear message', () => {
  assert.throws(() => parseBackup('not json'), /JSON invalide/);
  assert.throws(() => validateBackup({ format: 'other' }), /pas une sauvegarde/);
  const b = buildBackup(sample(), { schemaVersion: 1 });
  assert.throws(() => validateBackup({ ...b, formatVersion: 99 }), /plus récente/);
  assert.throws(() => validateBackup({ ...b, data: { ...b.data, programs: [] } }), /aucun programme/);
});

test('dates are ISO 8601 with local offset', () => {
  assert.match(localIso(new Date(2026, 10, 16, 9, 5, 7)), /^2026-11-16T09:05:07[+-]\d\d:\d\d$/);
  assert.equal(formatRest(150), '2 min 30');
  assert.equal(formatRest(120), '2 min');
  assert.equal(formatRest(20), '20 s');
  assert.equal(formatElapsed(3725000), '1:02:05');
  assert.equal(formatNumber(107.5), '107,5');
});
