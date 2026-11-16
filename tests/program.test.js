import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PROGRAM, SEED_EXERCISES } from '../js/data/seed.js';
import {
  buildSessionPlan, resolveSlotParams, coefficientOf, buildExerciseSets, referenceTargetFor, t1ExerciseIds, blockById,
} from '../js/engine/program.js';
import { proposeSetLoad } from '../js/engine/load.js';
import { estimateMinutes, exceedsMaxDuration } from '../js/engine/duration.js';
import { intensityPhrase } from '../js/engine/intensity.js';

const byId = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
const slot = (typeId, slotId) => SEED_PROGRAM.sessionTypes.find((t) => t.id === typeId).slots.find((s) => s.id === slotId);

test('seed: every slot points to a known exercise of the same pattern', () => {
  for (const t of SEED_PROGRAM.sessionTypes)
    for (const s of t.slots) {
      const e = byId[s.exerciseId];
      assert.ok(e, s.exerciseId);
      assert.ok(e.patterns.includes(s.pattern), `${s.id}: ${e.name} not in ${s.pattern}`);
    }
  assert.equal(SEED_PROGRAM.rotation.length, 9);
});

test('seed: supersets have exactly two slots, slots 1 and 2 are alone', () => {
  for (const t of SEED_PROGRAM.sessionTypes) {
    assert.equal(t.slots[0].group, null);
    assert.equal(t.slots[1].group, null);
    const groups = {};
    for (const s of t.slots) if (s.group) groups[s.group] = (groups[s.group] || 0) + 1;
    for (const n of Object.values(groups)) assert.equal(n, 2);
  }
});

test('inheritance: blocks 2 and 3 use the exercise of the slot and the block coefficients', () => {
  const b1 = buildSessionPlan(SEED_PROGRAM, { blockId: 'b1', sessionTypeId: 'A' }, byId);
  const b2 = buildSessionPlan(SEED_PROGRAM, { blockId: 'b2', sessionTypeId: 'A' }, byId);
  const b3 = buildSessionPlan(SEED_PROGRAM, { blockId: 'b3', sessionTypeId: 'A' }, byId);
  assert.deepEqual(b1.items.map((i) => i.exerciseId), b2.items.map((i) => i.exerciseId));
  assert.deepEqual(b1.items.map((i) => i.exerciseId), b3.items.map((i) => i.exerciseId));
  const squat2 = b2.items.find((i) => i.exerciseId === 'squat');
  const squat3 = b3.items.find((i) => i.exerciseId === 'squat');
  assert.equal(squat2.coef, 0.8);
  assert.equal(squat3.coef, 0.7);
  // Reference 100 kg in Force -> 80 kg and 70 kg working sets without history.
  const work2 = squat2.sets.find((s) => s.kind === 'work');
  const work3 = squat3.sets.find((s) => s.kind === 'work');
  assert.equal(proposeSetLoad(byId.squat, work2, [], { block: blockById(SEED_PROGRAM, 'b2'), coef: 0.8, reference: 100 }).load, 80);
  assert.equal(proposeSetLoad(byId.squat, work3, [], { block: blockById(SEED_PROGRAM, 'b3'), coef: 0.7, reference: 100 }).load, 70);
  // Lateral raises (T3, dumbbells): 10 kg x 0.75 = 7.5 -> 8 kg.
  const lat = b2.items.find((i) => i.exerciseId === 'lateral_raise');
  assert.equal(proposeSetLoad(byId.lateral_raise, lat.sets[0], [], { block: blockById(SEED_PROGRAM, 'b2'), coef: lat.coef, reference: 10 }).load, 8);
});

test('slot own parameters override the tier in every block (Nordic curl, Pallof press)', () => {
  for (const b of SEED_PROGRAM.blocks) {
    const p = resolveSlotParams(SEED_PROGRAM, b, slot('A', 'A5a'));
    assert.equal(p.sets, 2);
    assert.deepEqual(p.reps, [4, 6]);
    assert.equal(p.rir, null);
    const pallof = resolveSlotParams(SEED_PROGRAM, b, slot('C', 'C7'));
    assert.equal(pallof.rest, 60);
    assert.deepEqual(pallof.reps, [10, 10]);
  }
  const plan = buildSessionPlan(SEED_PROGRAM, { blockId: 'b2', sessionTypeId: 'A' }, byId);
  const nordic = plan.items.find((i) => i.exerciseId === 'nordic_curl');
  assert.equal(nordic.sets.length, 2);
  assert.equal(nordic.sets[0].rir, null);
});

test('per-block slot parameters win over own parameters', () => {
  const s = { ...slot('A', 'A2'), params: { sets: 5 }, paramsByBlock: { b2: { sets: 2 } } };
  assert.equal(resolveSlotParams(SEED_PROGRAM, SEED_PROGRAM.blocks[0], s).sets, 5);
  assert.equal(resolveSlotParams(SEED_PROGRAM, SEED_PROGRAM.blocks[1], s).sets, 2);
});

test('top set eligibility: eligible T1 get 1 top set + 3 work sets, others 4 work sets', () => {
  const plan = buildSessionPlan(SEED_PROGRAM, { blockId: 'b2', sessionTypeId: 'A' }, byId);
  const squat = plan.items.find((i) => i.exerciseId === 'squat');
  assert.deepEqual(squat.sets.map((s) => s.kind), ['top', 'work', 'work', 'work']);
  assert.deepEqual(squat.sets[0].repsRange, [3, 5]);
  assert.equal(squat.sets[0].targetReps, 4);
  assert.equal(squat.sets[0].rest, 150);
  assert.equal(squat.sets[1].rest, 120);
  const planB = buildSessionPlan(SEED_PROGRAM, { blockId: 'b3', sessionTypeId: 'B' }, byId);
  const bss = planB.items.find((i) => i.exerciseId === 'bulgarian_split_squat');
  assert.deepEqual(bss.sets.map((s) => s.kind), ['work', 'work', 'work', 'work']);
  const planC = buildSessionPlan(SEED_PROGRAM, { blockId: 'b2', sessionTypeId: 'C' }, byId);
  for (const id of ['romanian_deadlift', 'seated_db_press', 'one_arm_db_row']) {
    assert.equal(planC.items.find((i) => i.exerciseId === id).sets.length, 4, id);
  }
  // Force block: no top set, all sets heavy (4 to 8).
  const f = buildSessionPlan(SEED_PROGRAM, { blockId: 'b1', sessionTypeId: 'A' }, byId).items.find((i) => i.exerciseId === 'squat');
  assert.deepEqual(f.sets.map((s) => s.kind), ['work', 'work', 'work']);
  assert.deepEqual(f.sets[0].repsRange, [4, 8]);
  // The eligibility attribute is data: switching it changes the plan.
  const notEligible = { ...byId, squat: { ...byId.squat, topSetEligible: false } };
  const p2 = buildSessionPlan(SEED_PROGRAM, { blockId: 'b2', sessionTypeId: 'A' }, notEligible).items.find((i) => i.exerciseId === 'squat');
  assert.equal(p2.sets.length, 4);
  assert.ok(p2.sets.every((s) => s.kind === 'work'));
});

test('power and finisher sets carry no RIR', () => {
  const plan = buildSessionPlan(SEED_PROGRAM, { blockId: 'b1', sessionTypeId: 'A' }, byId);
  assert.ok(plan.items[0].sets.every((s) => s.kind === 'power' && s.rir === null));
  const farmer = plan.items.find((i) => i.exerciseId === 'farmer_walk');
  assert.equal(farmer.sets.length, 3);
  assert.ok(farmer.sets.every((s) => s.kind === 'finisher' && s.rir === null && s.targetReps === 30));
});

test('reference target for top sets without history comes from the Force block', () => {
  assert.deepEqual(referenceTargetFor(SEED_PROGRAM, slot('A', 'A2')), { reps: 6, rir: 2.5 });
  assert.equal(coefficientOf(SEED_PROGRAM, SEED_PROGRAM.blocks[0], slot('A', 'A2')), 1);
});

test('first launch asks only for T1 reference loads', () => {
  const ids = t1ExerciseIds(SEED_PROGRAM);
  assert.deepEqual(ids.sort(), [
    'bench', 'bulgarian_split_squat', 'chest_supported_row', 'one_arm_db_row', 'overhead_press', 'pull_up', 'romanian_deadlift', 'seated_db_press', 'squat',
  ].sort());
});

test('estimated work duration of every seed session stays under 80 minutes', () => {
  for (const r of SEED_PROGRAM.rotation) {
    const plan = buildSessionPlan(SEED_PROGRAM, r, byId);
    const min = estimateMinutes(plan.items, SEED_PROGRAM.superset);
    assert.ok(min > 20 && !exceedsMaxDuration(min), `${r.blockId}${r.sessionTypeId}: ${min} min`);
  }
});

test('intensity sentence by tier and RIR target', () => {
  const plan = buildSessionPlan(SEED_PROGRAM, { blockId: 'b2', sessionTypeId: 'A' }, byId);
  const squat = plan.items.find((i) => i.exerciseId === 'squat');
  assert.match(intensityPhrase(squat, squat.sets[0]), /3 à 5 reps en gardant 2 reps/);
  assert.match(intensityPhrase(squat, squat.sets[1]), /il te reste 1 à 2 reps en réserve/);
  assert.match(intensityPhrase(plan.items[0], plan.items[0].sets[0]), /Explosif/);
  const curl = plan.items.find((i) => i.exerciseId === 'biceps_curl');
  assert.match(intensityPhrase(curl, curl.sets[0]), /Proche de l.échec/);
});

test('dumbbell and unilateral exercises are flagged for display', () => {
  assert.equal(byId.bulgarian_split_squat.perSide, true);
  assert.equal(byId.walking_lunge.perSide, true);
  assert.equal(byId.one_arm_db_row.perSide, true);
  assert.equal(byId.suitcase_carry.perSide, true);
  assert.equal(byId.seated_db_press.equipment, 'dumbbell');
});

test('custom tier sets builder', () => {
  const sets = buildExerciseSets({ sets: 2, reps: [8, 12], rir: [1, 2], rest: 90, topSet: { reps: [3, 5], rir: [2, 2], rest: 150 } }, { topSetEligible: true }, 'T1');
  assert.deepEqual(sets.map((s) => s.kind), ['top', 'work', 'work']);
});
