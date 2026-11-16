// Program engine: block inheritance, slot parameters, top set eligibility, session plan.
// Pure module: no DOM, no storage.

import { targetRepsOf, targetRirOf } from './load.js';

export const TIERS = ['P', 'T1', 'T2', 'T3', 'F'];

export const TIER_LABELS = {
  P: 'Puissance',
  T1: 'Tier 1 lourd',
  T2: 'Tier 2 secondaire',
  T3: 'Tier 3 assistance',
  F: 'Finisseur',
};

export function blockById(program, id) {
  return program.blocks.find((b) => b.id === id) || null;
}

export function sessionTypeById(program, id) {
  return program.sessionTypes.find((s) => s.id === id) || null;
}

/** The block whose loads are entered by the user (the Force block in the seed). */
export function referenceBlock(program) {
  return program.blocks.find((b) => b.reference) || program.blocks[0];
}

/**
 * Parameters of a slot in a block: tier parameters of the block,
 * overridden by the slot's own parameters (all blocks), then by per-block slot parameters.
 */
export function resolveSlotParams(program, block, slot) {
  const tierParams = block.tiers?.[slot.tier] || {};
  const own = slot.params || {};
  const perBlock = slot.paramsByBlock?.[block.id] || {};
  return { ...tierParams, ...own, ...perBlock };
}

/** Coefficient applied to the Force reference load when there is no history. */
export function coefficientOf(program, block, slot) {
  const p = resolveSlotParams(program, block, slot);
  if (p.coef == null) return block.reference ? 1 : null;
  return p.coef;
}

/** Target (reps, RIR) of the reference block for this slot, used to turn a reference load into an e1RM. */
export function referenceTargetFor(program, slot) {
  const ref = referenceBlock(program);
  const p = resolveSlotParams(program, ref, slot);
  if (!p.reps || !p.rir) return null;
  return { reps: targetRepsOf(p.reps), rir: targetRirOf(p.rir) };
}

function makeSet(index, kind, repsRange, rir, rest) {
  return {
    index,
    kind,
    repsRange: repsRange ? [...repsRange] : null,
    targetReps: targetRepsOf(repsRange),
    rir: rir ? [...rir] : null,
    rest: rest ?? 90,
  };
}

/**
 * Planned sets of one exercise in one block.
 * - P: power sets, no RIR.
 * - F: finisher sets, no RIR.
 * - Other tiers: one top set first when the block asks for it and the exercise is eligible;
 *   a non-eligible exercise does setsWithoutTopSet working sets instead (4 by default).
 */
export function buildExerciseSets(params, exercise, tier) {
  const sets = [];
  if (tier === 'P') {
    for (let i = 0; i < (params.sets ?? 3); i++) sets.push(makeSet(i, 'power', params.reps, null, params.rest));
    return sets;
  }
  if (tier === 'F') {
    for (let i = 0; i < (params.sets ?? 3); i++) sets.push(makeSet(i, 'finisher', params.reps, null, params.rest));
    return sets;
  }
  let n = params.sets ?? 3;
  if (params.topSet) {
    if (exercise.topSetEligible) {
      sets.push(makeSet(0, 'top', params.topSet.reps, params.topSet.rir, params.topSet.rest ?? params.rest));
    } else {
      n = params.setsWithoutTopSet ?? n + 1;
    }
  }
  for (let i = 0; i < n; i++) sets.push(makeSet(sets.length, 'work', params.reps, params.rir, params.rest));
  return sets;
}

/** Exercise actually used by a slot, given optional session-only replacements. */
export function slotExerciseId(slot, sessionReplacements) {
  return sessionReplacements?.[slot.id] || slot.exerciseId;
}

/**
 * Full plan of a session (without loads): items in slot order with their planned sets.
 * rotationEntry: { blockId, sessionTypeId }
 */
export function buildSessionPlan(program, rotationEntry, exercisesById, sessionReplacements) {
  const block = blockById(program, rotationEntry.blockId);
  const type = sessionTypeById(program, rotationEntry.sessionTypeId);
  if (!block || !type) throw new Error('Unknown block or session type');
  const items = type.slots.map((slot) => {
    const exerciseId = slotExerciseId(slot, sessionReplacements);
    const exercise = exercisesById[exerciseId];
    if (!exercise) throw new Error(`Unknown exercise ${exerciseId}`);
    const params = resolveSlotParams(program, block, slot);
    return {
      slotId: slot.id,
      exerciseId,
      pattern: slot.pattern,
      tier: slot.tier,
      group: slot.group || null,
      coef: coefficientOf(program, block, slot),
      note: params.note || null,
      sets: buildExerciseSets(params, exercise, slot.tier),
    };
  });
  return {
    blockId: block.id,
    blockName: block.name,
    blockType: block.type,
    sessionTypeId: type.id,
    sessionName: type.name,
    items,
  };
}

/** Slots of a program whose tier is T1 (used by the first-launch assistant). */
export function t1ExerciseIds(program) {
  const ids = [];
  for (const t of program.sessionTypes) for (const s of t.slots) if (s.tier === 'T1' && !ids.includes(s.exerciseId)) ids.push(s.exerciseId);
  return ids;
}
