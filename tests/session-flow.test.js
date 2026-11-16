import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PROGRAM, SEED_EXERCISES } from '../js/data/seed.js';
import { buildSessionPlan } from '../js/engine/program.js';
import {
  buildOrder, restAfter, nextOpenStep, stopItemRemaining, addSet, skipSet, stopSession, progressOf, isSessionFinished, nextOpenSetOfItem,
} from '../js/engine/session-flow.js';
import { nextRotationIndex, cycleProgress, estimateEndDate, sessionsThisWeek, weekStart } from '../js/engine/rotation.js';

const byId = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
const plan = (b, t) => buildSessionPlan(SEED_PROGRAM, { blockId: b, sessionTypeId: t }, byId);
const label = (items, st) => `${items[st.item].exerciseId}:${st.set}${st.letter || ''}`;

test('superset order alternates 1A, 1B, 2A, 2B', () => {
  const { items } = plan('b1', 'A');
  const steps = buildOrder(items);
  const ss = steps.filter((s) => items[s.item].group === 'A3').map((s) => `${s.round}${s.letter}`);
  assert.deepEqual(ss, ['1A', '1B', '2A', '2B', '3A', '3B']);
  // Power and heavy legs alone first.
  assert.equal(items[steps[0].item].exerciseId, 'box_jump');
  assert.equal(items[steps[3].item].exerciseId, 'squat');
});

test('superset with different numbers of sets: remaining sets are done alone', () => {
  const { items } = plan('b1', 'A');
  const steps = buildOrder(items).filter((s) => items[s.item].group === 'A5');
  assert.deepEqual(steps.map((s) => label(items, s)), ['nordic_curl:0A', 'biceps_curl:0B', 'nordic_curl:1A', 'biceps_curl:1B', 'biceps_curl:2B']);
  assert.equal(steps[4].paired, false);
});

test('superset rests: short after A, long after B (150 s with a T1, 90 s otherwise), 150 s after a top set', () => {
  const { items } = plan('b1', 'A');
  const steps = buildOrder(items);
  const rest = (pred) => restAfter(items, steps, steps.findIndex(pred), SEED_PROGRAM.superset);
  assert.equal(rest((s) => items[s.item].exerciseId === 'pull_up'), 20);
  assert.equal(rest((s) => items[s.item].exerciseId === 'bench'), 150);
  assert.equal(rest((s) => items[s.item].exerciseId === 'walking_lunge'), 20);
  assert.equal(rest((s) => items[s.item].exerciseId === 'australian_pull'), 90);
  // Alone: block rest column.
  assert.equal(rest((s) => items[s.item].exerciseId === 'squat'), 150);
  assert.equal(rest((s) => items[s.item].exerciseId === 'box_jump'), 90);
  // Leftover curl set alone: T3 rest 90.
  const curlLast = steps.findIndex((s) => items[s.item].exerciseId === 'biceps_curl' && s.set === 2);
  assert.equal(restAfter(items, steps, curlLast, SEED_PROGRAM.superset), 90);
  // Block 2: top set of pull-up in a superset -> 150 s.
  const p2 = plan('b2', 'A');
  const st2 = buildOrder(p2.items);
  const topIdx = st2.findIndex((s) => p2.items[s.item].exerciseId === 'pull_up' && s.set === 0);
  assert.equal(restAfter(p2.items, st2, topIdx, SEED_PROGRAM.superset), 150);
  const workIdx = st2.findIndex((s) => p2.items[s.item].exerciseId === 'pull_up' && s.set === 1);
  assert.equal(restAfter(p2.items, st2, workIdx, SEED_PROGRAM.superset), 20);
  // Rest settings are adjustable.
  assert.equal(restAfter(items, steps, steps.findIndex((s) => items[s.item].exerciseId === 'pull_up'), { shortRest: 30 }), 30);
});

test('split pair ("Faire séparément"): exercises follow each other with normal rests', () => {
  const { items } = plan('b1', 'A');
  const steps = buildOrder(items, ['A3']);
  const ss = steps.filter((s) => items[s.item].group === 'A3').map((s) => label(items, s));
  assert.deepEqual(ss, ['pull_up:0', 'pull_up:1', 'pull_up:2', 'bench:0', 'bench:1', 'bench:2']);
  const i = steps.findIndex((s) => items[s.item].exerciseId === 'pull_up');
  assert.equal(restAfter(items, steps, i, SEED_PROGRAM.superset), 150);
});

test('navigation: next open step, wrapping, finished session', () => {
  let { items } = plan('b1', 'C');
  const steps = buildOrder(items);
  assert.equal(nextOpenStep(items, steps, -1), 0);
  items = items.map((it, i) => (i === 0 ? { ...it, sets: it.sets.map((s) => ({ ...s, status: 'done' })) } : it));
  assert.equal(nextOpenStep(items, steps, 0), 3);
  assert.equal(nextOpenStep(items, steps, steps.length - 1), 3);
  assert.equal(nextOpenSetOfItem(items[1], 0), 1);
  const all = items.map((it) => ({ ...it, sets: it.sets.map((s) => ({ ...s, status: 'done' })) }));
  assert.equal(isSessionFinished(all), true);
  assert.equal(nextOpenStep(all, steps, 2), -1);
});

test('power: "speed dropping" stops the exercise, remaining sets not done without penalty', () => {
  let { items } = plan('b1', 'A');
  items = items.map((it, i) => (i === 0 ? { ...it, sets: it.sets.map((s, j) => (j === 0 ? { ...s, status: 'done' } : s)) } : it));
  const stopped = stopItemRemaining(items, 0);
  assert.deepEqual(stopped[0].sets.map((s) => s.status), ['done', 'skipped', 'skipped']);
  assert.equal(stopped[0].sets[1].skipReason, 'speed');
  assert.deepEqual(progressOf(stopped), { done: 1, total: progressOf(items).total - 2 });
});

test('add and skip a set', () => {
  const { items } = plan('b1', 'A');
  const added = addSet(items, 1);
  assert.equal(added[1].sets.length, 4);
  assert.equal(added[1].sets[3].extra, true);
  const skipped = skipSet(items, 1, 2);
  assert.equal(skipped[1].sets[2].status, 'skipped');
});

test('stop session: open sets stay exactly as planned, session marked partial', () => {
  const { items } = plan('b1', 'A');
  const session = { status: 'in_progress', items };
  const stopped = stopSession(session, '2026-11-16T10:00:00+01:00');
  assert.equal(stopped.status, 'partial');
  assert.deepEqual(stopped.items, items);
});

test('rotation: next index, partial repeats only when asked', () => {
  assert.equal(nextRotationIndex(0, 9), 1);
  assert.equal(nextRotationIndex(8, 9), 0);
  assert.equal(nextRotationIndex(3, 9, { status: 'partial' }), 4);
  assert.equal(nextRotationIndex(3, 9, { status: 'partial', repeatPartial: true }), 3);
});

test('cycle progress counted in sessions, end date from the pace of the last 4 weeks', () => {
  const sessions = [{ status: 'complete' }, { status: 'partial' }, { status: 'in_progress' }];
  assert.deepEqual(cycleProgress({ rotations: 4 }, sessions, 9), { done: 2, total: 36, current: 3, finished: false, ratio: 2 / 36 });
  const now = new Date('2026-11-16T12:00:00');
  const dates = [1, 3, 5, 8, 10, 12].map((d) => new Date(now.getTime() - d * 86400000));
  // 6 sessions in 28 days -> 30 remaining sessions -> 140 days.
  const end = estimateEndDate(dates, 30, now, { cycleStart: '2026-09-01T00:00:00' });
  assert.equal(Math.round((end - now) / 86400000), 140);
  // Cycle started 3 days ago: planned pace (3 per week) -> 34 sessions -> 80 days.
  const early = estimateEndDate(dates.slice(0, 2), 34, now, { cycleStart: new Date(now.getTime() - 3 * 86400000), perWeek: 3 });
  assert.equal(Math.round((early - now) / 86400000), 80);
  // Monday-to-Sunday week.
  assert.equal(weekStart(new Date('2026-11-22T20:00:00')).getDate(), 16);
  assert.equal(sessionsThisWeek([{ status: 'complete', startedAt: '2026-11-16T09:00:00' }, { status: 'complete', startedAt: '2026-11-15T09:00:00' }], now), 1);
});
