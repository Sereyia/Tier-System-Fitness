import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  e1rm, loadForTarget, roundLoad, shiftLoad, recalcNextSet, sessionBaseE1rm, bestE1rm,
  proposeSetLoad, targetRepsOf, targetRirOf, toTotal, fromTotal, platesPerSide, rirToRpe, setE1rm,
} from '../js/engine/load.js';

const squat = { id: 'squat', equipment: 'barbell', unit: 'reps', noE1rm: false };
const pullUp = { id: 'pull_up', equipment: 'weighted_bodyweight', unit: 'reps', noE1rm: false };
const db = { id: 'db_bench', equipment: 'dumbbell', unit: 'reps', noE1rm: false, perSide: false };
const australian = { id: 'australian_pull', equipment: 'bodyweight', unit: 'reps', noE1rm: true };
const nordic = { id: 'nordic_curl', equipment: 'bodyweight', unit: 'reps', noE1rm: true };
const legCurl = { id: 'leg_curl', equipment: 'machine', unit: 'reps', noE1rm: false };
const kb = { id: 'kb', equipment: 'kettlebell', unit: 'reps', noE1rm: false };

const close = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

const force = { id: 'b1', type: 'force' };
const hyp = { id: 'b2', type: 'hypertrophy' };
const high = { id: 'b3', type: 'high_rep' };

function rec(load, reps, rir, extra = {}) {
  return { kind: 'work', load, reps, rir, repsRange: [5, 5], rirRange: [2, 2], ...extra };
}

test('e1RM adjusted with RIR (Epley)', () => {
  close(e1rm(100, 5, 2), 123.33);
  close(e1rm(110, 5, 1), 132.0);
  close(e1rm(100, 5, 3), 126.67);
  close(loadForTarget(132, 5, 2), 107.03);
});

test('target reps and RIR are the middle of the ranges', () => {
  assert.equal(targetRepsOf([3, 5]), 4);
  assert.equal(targetRepsOf([4, 8]), 6);
  assert.equal(targetRepsOf([8, 12]), 10);
  assert.equal(targetRepsOf([10, 15]), 13);
  assert.equal(targetRirOf([2, 3]), 2.5);
  assert.equal(targetRirOf([0, 0]), 0);
});

test('rounding by equipment', () => {
  assert.equal(roundLoad(107.03, 'barbell'), 107.5);
  assert.equal(roundLoad(104.86, 'barbell'), 105);
  assert.equal(roundLoad(23.1, 'dumbbell'), 24);
  assert.equal(roundLoad(22.9, 'dumbbell'), 22);
  assert.equal(roundLoad(52.4, 'machine'), 50);
  assert.equal(roundLoad(52.6, 'cable'), 55);
  assert.equal(roundLoad(17, 'kettlebell'), 16);
  assert.equal(roundLoad(19, 'kettlebell'), 18);
  assert.equal(roundLoad(13, 'barbell', { steps: { barbell: 5 } }), 15);
  assert.equal(shiftLoad(16, 1, 'kettlebell'), 18);
  assert.equal(shiftLoad(100, -1, 'barbell'), 97.5);
});

test('reference example: set-by-set recalculation from actual values', () => {
  const next = { kind: 'work', targetReps: 5, rir: [2, 2], repsRange: [5, 5] };
  // Set 1: 100 x 5 @ RIR 2 -> e1RM 123.3, set 2 stays at 100.
  const r1 = recalcNextSet({ exercise: squat, done: rec(100, 5, 2), next, currentProposal: 100 });
  close(r1.e1rm, 123.33);
  assert.equal(r1.load, 100);
  assert.equal(r1.changed, false);
  // Set 2 actually done at 110 x 5 @ RIR 1 -> e1RM 132.0, set 3 proposed 107.5.
  const r2 = recalcNextSet({ exercise: squat, done: rec(110, 5, 1), next, currentProposal: 100 });
  close(r2.e1rm, 132.0);
  assert.equal(r2.load, 107.5);
  assert.equal(r2.changed, true);
  // Next session: mean of the 2 best e1RM = 129.3 -> 105 kg, no progression guarantee.
  const sets = [rec(100, 5, 2), rec(110, 5, 1), rec(100, 5, 3)];
  close(sessionBaseE1rm(sets, squat), 129.33);
  const p = proposeSetLoad(squat, next, [{ blockId: 'b1', blockType: 'force', coef: 1, sets }], { block: force, coef: 1 });
  assert.equal(p.load, 105);
  assert.equal(p.guaranteed, false);
  // Record uses the best set.
  close(bestE1rm(sets, squat), 132.0);
});

test('guard: a set inside the RIR target zone does not change the next proposal', () => {
  // Target 6 reps @ RIR 2-3 (2.5). 100 x 6 @ RIR 2 -> raw 98.7: less than one step away -> keep 100.
  const next = { kind: 'work', targetReps: 6, rir: [2, 3] };
  const r = recalcNextSet({ exercise: squat, done: rec(100, 6, 2), next, currentProposal: 100 });
  assert.equal(r.load, 100);
  assert.equal(r.changed, false);
});

test('guard: no change below one equipment step', () => {
  const next = { kind: 'work', targetReps: 5, rir: [2, 2] };
  // 101 x 5 @ 2 -> 101 exactly, current 100: diff < 2.5 -> keep 100.
  const r = recalcNextSet({ exercise: squat, done: rec(101, 5, 2), next, currentProposal: 100 });
  assert.equal(r.load, 100);
  assert.equal(r.changed, false);
});

test('guard: variation limited to +/-10 % of the next set proposal', () => {
  const next = { kind: 'work', targetReps: 5, rir: [2, 2] };
  const up = recalcNextSet({ exercise: squat, done: rec(130, 5, 2), next, currentProposal: 100 });
  assert.equal(up.load, 110);
  const down = recalcNextSet({ exercise: squat, done: rec(70, 5, 2), next, currentProposal: 100 });
  assert.equal(down.load, 90);
});

test('top set then working sets: recalculated after the top set (block 2)', () => {
  // Top set 4 reps @ RIR 2 at 120 kg -> e1RM 144; work 10 reps @ RIR 1.5 -> 104.1 -> 105.
  const work = { kind: 'work', targetReps: 10, rir: [1, 2] };
  const r = recalcNextSet({ exercise: squat, done: { kind: 'top', load: 120, reps: 4, rir: 2 }, next: work, currentProposal: 100 });
  assert.equal(r.load, 105);
});

test('next session base: mean of the 2 best e1RM includes the top set', () => {
  const sets = [
    { kind: 'top', load: 120, reps: 4, rir: 2 },
    { kind: 'work', load: 100, reps: 10, rir: 2 },
    { kind: 'work', load: 100, reps: 9, rir: 1 },
  ];
  close(sessionBaseE1rm(sets, squat), (144 + 140) / 2);
});

test('progression guarantee without double counting', () => {
  const next = { kind: 'work', targetReps: 6, rir: [2, 3], repsRange: [4, 8] };
  // Last session (same block type): 100 x 8 @ RIR 2 on all sets.
  const sets = [1, 2, 3].map(() => ({ kind: 'work', load: 100, reps: 8, rir: 2, repsRange: [4, 8], rirRange: [2, 3] }));
  const hist = [{ blockId: 'b1', blockType: 'force', coef: 1, sets }];
  const p = proposeSetLoad(squat, next, hist, { block: force, coef: 1 });
  // e1RM = 100 x 1.3333 = 133.3 -> target 6 @ 2.5 -> 103.9 -> 105. Already >= 102.5: no bonus on top.
  assert.equal(p.load, 105);
  assert.equal(p.guaranteed, false);
  // Guarantee kicks in when the e1RM-based proposal would be lower than last load + 1 step.
  const low = [1, 2, 3].map(() => ({ kind: 'work', load: 100, reps: 8, rir: 3, repsRange: [8, 8], rirRange: [3, 3] }));
  const next2 = { kind: 'work', targetReps: 8, rir: [3, 3], repsRange: [8, 8] };
  // e1RM = 100 x (1 + 11/30) = 136.7; target 8 @ 3 -> 100 exactly; guarantee -> 102.5.
  const p2 = proposeSetLoad(squat, next2, [{ blockId: 'b1', blockType: 'force', coef: 1, sets: low }], { block: force, coef: 1 });
  assert.equal(p2.load, 102.5);
  assert.equal(p2.guaranteed, true);
  // Different block type: no guarantee.
  const p3 = proposeSetLoad(squat, next2, [{ blockId: 'b2', blockType: 'hypertrophy', coef: 0.8, sets: low }], { block: force, coef: 1 });
  assert.equal(p3.load, 100);
  assert.equal(p3.guaranteed, false);
});

function simulate(sessions, extraRepsPerSession) {
  const target = { kind: 'work', targetReps: 10, rir: [1, 2], repsRange: [8, 12] };
  let history = [{ blockId: 'b2', blockType: 'hypertrophy', coef: 0.8, sets: [1, 2, 3].map(() => ({ kind: 'work', load: 80, reps: 10, rir: 1.5, repsRange: [8, 12], rirRange: [1, 2] })) }];
  const proposals = [];
  for (let i = 1; i <= sessions; i++) {
    const p = proposeSetLoad(squat, target, history, { block: hyp, coef: 0.8 });
    proposals.push(p.load);
    const reps = Math.min(15, 10 + extraRepsPerSession * i);
    const sets = [1, 2, 3].map(() => ({ kind: 'work', load: p.load, reps, rir: 1.5, repsRange: [8, 12], rirRange: [1, 2] }));
    history = [{ blockId: 'b2', blockType: 'hypertrophy', coef: 0.8, sets }, ...history];
  }
  return proposals;
}

test('stability: 12 sessions at exactly the proposed load, target reps and RIR', () => {
  const proposals = simulate(12, 0);
  const min = Math.min(...proposals);
  assert.ok(min >= 80 - 2.5, `drifted down to ${min}`);
  assert.ok(Math.max(...proposals) <= 80 + 2.5, 'drifted up');
});

test('stability: +1 rep every session makes proposals go up', () => {
  const proposals = simulate(12, 1);
  assert.ok(proposals[proposals.length - 1] > proposals[0], proposals.join(','));
  for (let i = 1; i < proposals.length; i++) assert.ok(proposals[i] >= proposals[i - 1]);
});

test('stability with top set and working sets (blocks with top set)', () => {
  const top = { kind: 'top', targetReps: 4, rir: [2, 2], repsRange: [3, 5] };
  const work = { kind: 'work', targetReps: 10, rir: [1, 2], repsRange: [8, 12] };
  let history = [{ blockId: 'b2', blockType: 'hypertrophy', coef: 0.8, sets: [
    { kind: 'top', load: 100, reps: 4, rir: 2, repsRange: [3, 5], rirRange: [2, 2] },
    ...[1, 2, 3].map(() => ({ kind: 'work', load: 85, reps: 10, rir: 1.5, repsRange: [8, 12], rirRange: [1, 2] })),
  ] }];
  const tops = [];
  for (let i = 0; i < 12; i++) {
    const pt = proposeSetLoad(squat, top, history, { block: hyp, coef: 0.8 }).load;
    const pw = proposeSetLoad(squat, work, history, { block: hyp, coef: 0.8 }).load;
    tops.push(pt);
    history = [{ blockId: 'b2', blockType: 'hypertrophy', coef: 0.8, sets: [
      { kind: 'top', load: pt, reps: 4, rir: 2, repsRange: [3, 5], rirRange: [2, 2] },
      ...[1, 2, 3].map(() => ({ kind: 'work', load: pw, reps: 10, rir: 1.5, repsRange: [8, 12], rirRange: [1, 2] })),
    ] }, ...history];
  }
  assert.ok(Math.min(...tops) >= tops[0] - 2.5, tops.join(','));
});

test('high reps: no e1RM for sets above 15 reps, flagged exercises or no load', () => {
  assert.equal(setE1rm({ kind: 'work', load: 20, reps: 16, rir: 1 }, legCurl), null);
  assert.equal(setE1rm({ kind: 'work', load: 0, reps: 12, rir: 1 }, australian, 80), null);
  assert.ok(setE1rm({ kind: 'work', load: 20, reps: 15, rir: 1 }, legCurl) > 0);
});

test('high reps in session: RIR above target max + 1 -> +1 step, below min -> -1 step', () => {
  const next = { kind: 'work', targetReps: 18, rir: [0, 1], repsRange: [15, 20] };
  assert.equal(recalcNextSet({ exercise: legCurl, done: { kind: 'work', load: 40, reps: 18, rir: 3 }, next, currentProposal: 40 }).load, 45);
  assert.equal(recalcNextSet({ exercise: legCurl, done: { kind: 'work', load: 40, reps: 18, rir: 2 }, next, currentProposal: 40 }).load, 40);
  const next2 = { kind: 'work', targetReps: 18, rir: [1, 1], repsRange: [15, 20] };
  assert.equal(recalcNextSet({ exercise: legCurl, done: { kind: 'work', load: 40, reps: 18, rir: 0 }, next: next2, currentProposal: 40 }).load, 35);
  // The actual load is the basis: user went to 45, RIR in range -> 45.
  assert.equal(recalcNextSet({ exercise: legCurl, done: { kind: 'work', load: 45, reps: 18, rir: 1 }, next, currentProposal: 40 }).load, 45);
});

test('high reps next session: double progression in the same block type', () => {
  const set = { kind: 'work', targetReps: 18, rir: [0, 0], repsRange: [15, 20] };
  const mk = (reps, rir) => ({ kind: 'work', load: 40, reps, rir, repsRange: [15, 20], rirRange: [0, 0] });
  const ctx = { block: high, coef: 0.7 };
  assert.equal(proposeSetLoad(legCurl, set, [{ blockType: 'high_rep', coef: 0.7, sets: [mk(20, 0), mk(20, 0), mk(20, 0)] }], ctx).load, 45);
  assert.equal(proposeSetLoad(legCurl, set, [{ blockType: 'high_rep', coef: 0.7, sets: [mk(20, 0), mk(14, 0), mk(16, 0)] }], ctx).load, 35);
  assert.equal(proposeSetLoad(legCurl, set, [{ blockType: 'high_rep', coef: 0.7, sets: [mk(20, 0), mk(18, 0), mk(16, 0)] }], ctx).load, 40);
});

test('high reps: block change applies the coefficient ratio', () => {
  const set = { kind: 'work', targetReps: 18, rir: [0, 0], repsRange: [15, 20] };
  const last = [{ blockType: 'hypertrophy', coef: 0.75, sets: [{ kind: 'work', load: 50, reps: 16, rir: 1, repsRange: [12, 20], rirRange: [0, 1] }] }];
  // 50 x 0.7 / 0.75 = 46.7 -> 45 (machine step 5).
  assert.equal(proposeSetLoad(legCurl, set, last, { block: high, coef: 0.7 }).load, 45);
});

test('Nordic curl: progression on reps then reduced assistance (negative load)', () => {
  const set = { kind: 'work', targetReps: 5, rir: null, repsRange: [4, 6] };
  const mk = (reps) => ({ kind: 'work', load: -10, reps, rir: null, repsRange: [4, 6], rirRange: null });
  const p = proposeSetLoad(nordic, set, [{ blockType: 'force', coef: 1, sets: [mk(6), mk(6)] }], { block: force, coef: 1, bodyweight: 80 });
  assert.equal(p.load, -7.5);
});

test('weighted body weight: total = body weight + added load, proposal shows the added load', () => {
  assert.equal(toTotal(10, pullUp, 80), 90);
  assert.equal(fromTotal(90, pullUp, 80), 10);
  const next = { kind: 'work', targetReps: 6, rir: [2, 3] };
  // 80 + 10 = 90 x 8 @ 2 -> e1RM 120; target 6 @ 2.5 -> 93.5 total -> 13.5 added -> 12.5.
  const r = recalcNextSet({ exercise: pullUp, done: { kind: 'work', load: 10, reps: 8, rir: 2 }, next, currentProposal: 10, bodyweight: 80 });
  assert.equal(r.load, 12.5);
  // Recorded body weight is used for history.
  close(setE1rm({ kind: 'work', load: 0, reps: 6, rir: 2, bodyweight: 70 }, pullUp, 80), 70 * (1 + 8 / 30));
});

test('dumbbells: load per dumbbell, rounded to 2 kg', () => {
  const next = { kind: 'work', targetReps: 10, rir: [1, 2] };
  // 30 x 12 @ 1 -> raw 31.1: less than 2 kg away -> unchanged.
  assert.equal(recalcNextSet({ exercise: db, done: { kind: 'work', load: 30, reps: 12, rir: 1 }, next, currentProposal: 30 }).load, 30);
  // 30 x 14 @ 1 -> e1RM 45 -> raw 32.5 -> 32 per dumbbell.
  assert.equal(recalcNextSet({ exercise: db, done: { kind: 'work', load: 30, reps: 14, rir: 1 }, next, currentProposal: 30 }).load, 32);
});

test('no history: Force reference x block coefficient', () => {
  const work = { kind: 'work', targetReps: 10, rir: [1, 2] };
  assert.equal(proposeSetLoad(squat, work, [], { block: hyp, coef: 0.8, reference: 100 }).load, 80);
  assert.equal(proposeSetLoad(squat, work, [], { block: high, coef: 0.7, reference: 100 }).load, 70);
  assert.equal(proposeSetLoad(db, work, [], { block: hyp, coef: 0.75, reference: 30 }).load, 22);
  const none = proposeSetLoad(squat, work, [], { block: hyp, coef: 0.8 });
  assert.equal(none.load, null);
  assert.equal(none.source, 'ask');
});

test('no history: top set from the reference e1RM', () => {
  const top = { kind: 'top', targetReps: 4, rir: [2, 2] };
  // 100 kg for 6 @ 2.5 -> e1RM 128.3 -> 4 @ 2 -> 106.9 -> 107.5.
  const p = proposeSetLoad(squat, top, [], { block: hyp, coef: 0.8, reference: 100, referenceTarget: { reps: 6, rir: 2.5 } });
  assert.equal(p.load, 107.5);
});

test('partial sessions: exercises not done keep their last real history', () => {
  const work = { kind: 'work', targetReps: 6, rir: [2, 3], repsRange: [4, 8] };
  const r6 = () => rec(100, 6, 2.5, { repsRange: [4, 8], rirRange: [2, 3] });
  const older = { blockType: 'force', coef: 1, sets: [r6(), r6()] };
  const partialEmpty = { blockType: 'force', coef: 1, sets: [] };
  const withPartial = proposeSetLoad(squat, work, [partialEmpty, older], { block: force, coef: 1 });
  const without = proposeSetLoad(squat, work, [older], { block: force, coef: 1 });
  assert.equal(withPartial.load, without.load);
  assert.equal(withPartial.load, 100);
});

test('kettlebell rounding uses the list of available weights', () => {
  assert.equal(roundLoad(21, 'kettlebell'), 20);
  assert.equal(roundLoad(23, 'kettlebell'), 24);
  assert.equal(proposeSetLoad(kb, { kind: 'work', targetReps: 10, rir: [1, 2] }, [], { block: hyp, coef: 0.75, reference: 24 }).load, 18);
});

test('plate calculator and RPE display', () => {
  assert.deepEqual(platesPerSide(107.5, 20), [25, 15, 2.5, 1.25]);
  assert.deepEqual(platesPerSide(20, 20), []);
  assert.equal(platesPerSide(21, 20), null);
  assert.equal(rirToRpe(2), 8);
});
