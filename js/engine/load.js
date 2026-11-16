// Load engine: e1RM, rounding, in-session recalculation, next-session proposals.
// Pure module: no DOM, no storage. All weights in kg.

const EPS = 1e-9;

export const DEFAULT_EQUIPMENT_SETTINGS = {
  steps: {
    barbell: 2.5,
    dumbbell: 2,
    machine: 5,
    cable: 5,
    weighted_bodyweight: 2.5,
    bodyweight: 2.5,
    medball: 1,
    kettlebell: null,
    none: null,
  },
  kettlebells: [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48],
};

/** Equipment for which the entered load is an added weight on top of body weight. */
export function isBodyweightLoaded(exercise) {
  return exercise.equipment === 'weighted_bodyweight' || exercise.equipment === 'bodyweight';
}

/** Equipment that carries no load at all. */
export function hasNoLoad(exercise) {
  return exercise.equipment === 'none';
}

export function repFactor(reps, rir) {
  return 1 + (reps + (rir ?? 0)) / 30;
}

/** Epley estimate adjusted with RIR: load x (1 + (reps + RIR) / 30). */
export function e1rm(totalLoad, reps, rir) {
  return totalLoad * repFactor(reps, rir);
}

export function loadForTarget(e1, reps, rir) {
  return e1 / repFactor(reps, rir);
}

/** Target reps = middle of the range, rounded to a whole rep (half up). */
export function targetRepsOf(range) {
  if (!range) return null;
  return Math.round((range[0] + range[1]) / 2 + EPS);
}

/** Target RIR = middle of the RIR range (may be fractional). */
export function targetRirOf(range) {
  if (!range) return null;
  return (range[0] + range[1]) / 2;
}

function clean(x) {
  return Math.round(x * 1000) / 1000;
}

function settingsOf(settings) {
  return {
    steps: { ...DEFAULT_EQUIPMENT_SETTINGS.steps, ...(settings?.steps || {}) },
    kettlebells: settings?.kettlebells?.length ? [...settings.kettlebells].sort((a, b) => a - b) : DEFAULT_EQUIPMENT_SETTINGS.kettlebells,
  };
}

export function stepOf(equipment, settings) {
  const s = settingsOf(settings);
  return s.steps[equipment] ?? null;
}

/** Round to the nearest available load for this equipment. */
export function roundLoad(value, equipment, settings) {
  if (value == null || Number.isNaN(value)) return null;
  const s = settingsOf(settings);
  if (equipment === 'kettlebell') {
    let best = s.kettlebells[0];
    for (const w of s.kettlebells) if (Math.abs(w - value) < Math.abs(best - value) - EPS) best = w;
    return best;
  }
  const step = s.steps[equipment];
  if (!step) return clean(value);
  return clean(Math.round(value / step + EPS) * step);
}

export function roundLoadDown(value, equipment, settings) {
  const s = settingsOf(settings);
  if (equipment === 'kettlebell') {
    const below = s.kettlebells.filter((w) => w <= value + EPS);
    return below.length ? below[below.length - 1] : s.kettlebells[0];
  }
  const step = s.steps[equipment];
  if (!step) return clean(value);
  return clean(Math.floor(value / step + EPS) * step);
}

export function roundLoadUp(value, equipment, settings) {
  const s = settingsOf(settings);
  if (equipment === 'kettlebell') {
    const above = s.kettlebells.filter((w) => w >= value - EPS);
    return above.length ? above[0] : s.kettlebells[s.kettlebells.length - 1];
  }
  const step = s.steps[equipment];
  if (!step) return clean(value);
  return clean(Math.ceil(value / step - EPS) * step);
}

/** Move a load by n equipment steps (n may be negative). */
export function shiftLoad(load, n, equipment, settings) {
  const s = settingsOf(settings);
  if (equipment === 'kettlebell') {
    const list = s.kettlebells;
    let i = list.indexOf(roundLoad(load, 'kettlebell', settings));
    i = Math.min(list.length - 1, Math.max(0, i + n));
    return list[i];
  }
  const step = s.steps[equipment];
  if (!step) return load;
  return clean((load ?? 0) + n * step);
}

export function toTotal(load, exercise, bodyweight) {
  if (load == null) return null;
  return isBodyweightLoaded(exercise) ? (bodyweight || 0) + load : load;
}

export function fromTotal(total, exercise, bodyweight) {
  if (total == null) return null;
  return isBodyweightLoaded(exercise) ? total - (bodyweight || 0) : total;
}

/**
 * Load mode of a planned set:
 *  - 'power': power exercise (no load required, no RIR)
 *  - 'finisher': loaded carry or core work, last load reused
 *  - 'e1rm': load driven by the estimated max
 *  - 'highrep': double progression (sets above 15 reps, no usable load, flagged exercises)
 */
export function loadModeOf(exercise, set) {
  if (set.kind === 'power') return 'power';
  if (set.kind === 'finisher') return 'finisher';
  if (exercise.noE1rm || exercise.unit !== 'reps' || hasNoLoad(exercise)) return 'highrep';
  if (set.targetReps != null && set.targetReps > 15) return 'highrep';
  if (set.rir == null) return 'highrep';
  return 'e1rm';
}

/** A recorded set can produce an e1RM only if it is a loaded reps set of 15 reps or fewer. */
export function setE1rm(rec, exercise, bodyweight) {
  if (!rec || rec.skipped) return null;
  if (rec.kind === 'power' || rec.kind === 'finisher') return null;
  if (exercise.noE1rm || exercise.unit !== 'reps' || hasNoLoad(exercise)) return null;
  if (rec.reps == null || rec.reps <= 0 || rec.reps > 15) return null;
  if (rec.load == null || rec.rir == null) return null;
  const total = rec.bodyweight != null && isBodyweightLoaded(exercise) ? rec.bodyweight + rec.load : toTotal(rec.load, exercise, bodyweight);
  if (total <= 0) return null;
  return e1rm(total, rec.reps, rec.rir);
}

/**
 * Proposal for the next set of the same exercise during a session,
 * computed from the set just validated (actual values only).
 * Guards (relative to the next set's current proposal): change only if at least one step,
 * variation limited to +/-10 % (on total load for body-weight exercises).
 * Returns { load, changed, e1rm }.
 */
export function recalcNextSet({ exercise, done, next, currentProposal, bodyweight, settings }) {
  const mode = loadModeOf(exercise, next);
  const eq = exercise.equipment;
  if (mode === 'power' || mode === 'finisher') {
    const load = done.load ?? currentProposal ?? null;
    return { load, changed: load !== currentProposal, e1rm: null };
  }
  if (mode === 'highrep') {
    if (done.load == null) return { load: currentProposal ?? null, changed: false, e1rm: null };
    let load = done.load;
    if (next.rir && done.rir != null) {
      if (done.rir > next.rir[1] + 1) load = shiftLoad(done.load, 1, eq, settings);
      else if (done.rir < next.rir[0]) load = shiftLoad(done.load, -1, eq, settings);
    }
    return { load, changed: load !== currentProposal, e1rm: null };
  }
  const e1 = setE1rm(done, exercise, bodyweight);
  if (e1 == null) return { load: currentProposal ?? done.load ?? null, changed: false, e1rm: null };
  const rawTotal = loadForTarget(e1, next.targetReps, targetRirOf(next.rir));
  const raw = fromTotal(rawTotal, exercise, bodyweight);
  let candidate = roundLoad(raw, eq, settings);
  if (currentProposal == null) return { load: candidate, changed: true, e1rm: e1 };
  const step = stepOf(eq, settings) ?? 0;
  // Minimum-step guard on the unrounded value: small deviations inside the target zone change nothing.
  if (Math.abs(raw - currentProposal) < step - EPS) {
    return { load: currentProposal, changed: false, e1rm: e1 };
  }
  const currentTotal = toTotal(currentProposal, exercise, bodyweight);
  if (currentTotal > 0) {
    const hi = roundLoadDown(fromTotal(currentTotal * 1.1, exercise, bodyweight), eq, settings);
    const lo = roundLoadUp(fromTotal(currentTotal * 0.9, exercise, bodyweight), eq, settings);
    candidate = Math.min(Math.max(candidate, lo), hi);
  }
  return { load: candidate, changed: Math.abs(candidate - currentProposal) > EPS, e1rm: e1 };
}

/** Mean of the two best e1RM of one past session (top set included). */
export function sessionBaseE1rm(sets, exercise, bodyweight) {
  const values = sets.map((s) => setE1rm(s, exercise, bodyweight)).filter((v) => v != null).sort((a, b) => b - a);
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  return (values[0] + values[1]) / 2;
}

/** Best e1RM over a list of sets (records use the best set, never an average). */
export function bestE1rm(sets, exercise, bodyweight) {
  let best = null;
  for (const s of sets) {
    const v = setE1rm(s, exercise, bodyweight);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

function workSetsOfKind(sets, kind) {
  return sets.filter((s) => !s.skipped && s.kind === kind);
}

/** All sets of this kind reached the top of their range with RIR >= target RIR minimum. */
export function allTopOfRange(sets, kind, { ignoreRir = false } = {}) {
  const list = workSetsOfKind(sets, kind);
  if (!list.length) return false;
  return list.every((s) => {
    if (!s.repsRange || s.reps == null) return false;
    if (s.reps < s.repsRange[1]) return false;
    if (ignoreRir || !s.rirRange) return true;
    return s.rir != null && s.rir >= s.rirRange[0];
  });
}

function anyBelowRange(sets, kind) {
  return workSetsOfKind(sets, kind).some((s) => s.repsRange && s.reps != null && s.reps < s.repsRange[0]);
}

function lastLoadOfKind(sets, kind) {
  const list = workSetsOfKind(sets, kind).filter((s) => s.load != null);
  if (list.length) return list[list.length - 1].load;
  const any = sets.filter((s) => !s.skipped && s.load != null);
  return any.length ? any[any.length - 1].load : null;
}

/**
 * Proposal for one planned set at the start of a session.
 * history: past sessions of this exercise, most recent first:
 *   [{ blockId, blockType, coef, sets: [recorded sets] }]
 * ctx: { block (today), coef (today tier coefficient), reference, referenceTarget, bodyweight, settings }
 * Returns { load, source, guaranteed }.
 * source: 'history' | 'reference' | 'last' | 'ask' | 'none'
 */
export function proposeSetLoad(exercise, set, history, ctx) {
  const { bodyweight, settings } = ctx;
  const eq = exercise.equipment;
  const mode = loadModeOf(exercise, set);
  const withSets = (history || []).filter((h) => h.sets && h.sets.some((s) => !s.skipped));
  const last = withSets[0] || null;

  if (hasNoLoad(exercise)) return { load: null, source: 'none', guaranteed: false };

  if (mode === 'power' || mode === 'finisher') {
    if (last) return { load: lastLoadOfKind(last.sets, set.kind), source: 'last', guaranteed: false };
    if (ctx.reference != null) return { load: ctx.reference, source: 'reference', guaranteed: false };
    return { load: null, source: mode === 'power' ? 'none' : 'ask', guaranteed: false };
  }

  if (mode === 'e1rm') {
    const lastWithE1 = withSets.find((h) => sessionBaseE1rm(h.sets, exercise, bodyweight) != null);
    if (lastWithE1) {
      const base = sessionBaseE1rm(lastWithE1.sets, exercise, bodyweight);
      const raw = fromTotal(loadForTarget(base, set.targetReps, targetRirOf(set.rir)), exercise, bodyweight);
      let load = roundLoad(raw, eq, settings);
      let guaranteed = false;
      if (last === lastWithE1 && last.blockType === ctx.block.type && allTopOfRange(last.sets, set.kind)) {
        const prev = lastLoadOfKind(last.sets, set.kind);
        if (prev != null) {
          const floor = shiftLoad(prev, 1, eq, settings);
          if (load < floor - EPS) {
            load = floor;
            guaranteed = true;
          }
        }
      }
      return { load, source: 'history', guaranteed };
    }
  }

  if (last) {
    // High-rep rule (or no usable e1RM in history): double progression / block ratio.
    const prev = lastLoadOfKind(last.sets, set.kind);
    if (prev == null) return { load: null, source: 'ask', guaranteed: false };
    if (last.blockType === ctx.block.type) {
      const ignoreRir = !set.rir;
      if (allTopOfRange(last.sets, set.kind, { ignoreRir })) return { load: shiftLoad(prev, 1, eq, settings), source: 'history', guaranteed: true };
      if (anyBelowRange(last.sets, set.kind)) return { load: shiftLoad(prev, -1, eq, settings), source: 'history', guaranteed: false };
      return { load: prev, source: 'history', guaranteed: false };
    }
    const from = last.coef || 1;
    const to = ctx.coef || 1;
    return { load: roundLoad((prev * to) / from, eq, settings), source: 'history', guaranteed: false };
  }

  if (ctx.reference != null) {
    if (set.kind === 'top' && ctx.referenceTarget) {
      // Top set without history: e1RM from the Force reference, then top-set target.
      const refTotal = toTotal(ctx.reference, exercise, bodyweight);
      const e1 = e1rm(refTotal, ctx.referenceTarget.reps, ctx.referenceTarget.rir);
      const raw = fromTotal(loadForTarget(e1, set.targetReps, targetRirOf(set.rir)), exercise, bodyweight);
      return { load: roundLoad(raw, eq, settings), source: 'reference', guaranteed: false };
    }
    return { load: roundLoad(ctx.reference * (ctx.coef ?? 1), eq, settings), source: 'reference', guaranteed: false };
  }
  return { load: null, source: 'ask', guaranteed: false };
}

/** Plates per side for a barbell load. Returns null if the load cannot be made exactly. */
export function platesPerSide(total, barWeight = 20, plates = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  let side = (total - barWeight) / 2;
  if (side < -EPS) return null;
  const out = [];
  for (const p of plates) {
    while (side >= p - EPS) {
      out.push(p);
      side = clean(side - p);
    }
  }
  return side > EPS ? null : out;
}

/** RPE display helper: RPE = 10 - RIR. Storage always stays in RIR. */
export function rirToRpe(rir) {
  return rir == null ? null : 10 - rir;
}
