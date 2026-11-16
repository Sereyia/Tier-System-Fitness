// Session flow: superset order, advised rest, navigation between sets, stop rules.
// Pure module: no DOM, no storage.

export const DEFAULT_SUPERSET_SETTINGS = { shortRest: 20, longRest: 90, longRestT1: 150 };

/**
 * Units of execution: a single item, or a pair of items sharing a group (superset).
 * A split group (done separately for this session) becomes two single units.
 */
export function unitsOf(items, split = []) {
  const units = [];
  const seen = new Set();
  items.forEach((item, idx) => {
    if (seen.has(idx)) return;
    seen.add(idx);
    if (item.group && !split.includes(item.group)) {
      const partner = items.findIndex((it, j) => j !== idx && !seen.has(j) && it.group === item.group);
      if (partner >= 0) {
        seen.add(partner);
        units.push({ type: 'pair', group: item.group, items: [idx, partner] });
        return;
      }
    }
    units.push({ type: 'single', items: [idx] });
  });
  return units;
}

/**
 * Ordered list of steps { item, set, round, letter, paired }.
 * Pairs alternate 1A, 1B, 2A, 2B... Remaining sets of the longer exercise are done alone.
 */
export function buildOrder(items, split = []) {
  const steps = [];
  for (const unit of unitsOf(items, split)) {
    if (unit.type === 'single') {
      const i = unit.items[0];
      items[i].sets.forEach((_, s) => steps.push({ item: i, set: s, round: s + 1, letter: null, paired: false }));
      continue;
    }
    const [a, b] = unit.items;
    const n = Math.max(items[a].sets.length, items[b].sets.length);
    for (let r = 0; r < n; r++) {
      const hasA = r < items[a].sets.length;
      const hasB = r < items[b].sets.length;
      const both = hasA && hasB;
      if (hasA) steps.push({ item: a, set: r, round: r + 1, letter: 'A', paired: both });
      if (hasB) steps.push({ item: b, set: r, round: r + 1, letter: 'B', paired: both });
    }
  }
  return steps;
}

function pairHasT1(items, step, steps) {
  const item = items[step.item];
  if (!item.group) return false;
  return items.some((it) => it.group === item.group && it.tier === 'T1');
}

/**
 * Advised rest (seconds) after a step.
 * - Alone: the set's rest (block column), or the exercise's own rest if set.
 * - In a pair: short rest after exercise A, long rest after exercise B
 *   (longRestT1 if the pair contains a T1, longRest otherwise).
 * - After a T1 top set in a superset: long rest of longRestT1.
 */
export function restAfter(items, steps, stepIndex, settings = DEFAULT_SUPERSET_SETTINGS) {
  const s = { ...DEFAULT_SUPERSET_SETTINGS, ...settings };
  const step = steps[stepIndex];
  const item = items[step.item];
  const set = item.sets[step.set];
  if (!step.paired) return item.restOverride ?? set.rest ?? 90;
  if (set.kind === 'top') return s.longRestT1;
  if (step.letter === 'A') return s.shortRest;
  return pairHasT1(items, step, steps) ? s.longRestT1 : s.longRest;
}

export function isOpen(set) {
  return !set.status || set.status === 'todo';
}

/** Index of the next step still to do after position `from` (wrapping to the start). -1 if none. */
export function nextOpenStep(items, steps, from = -1) {
  for (let i = from + 1; i < steps.length; i++) if (isOpen(items[steps[i].item].sets[steps[i].set])) return i;
  for (let i = 0; i <= Math.min(from, steps.length - 1); i++) if (isOpen(items[steps[i].item].sets[steps[i].set])) return i;
  return -1;
}

/** Step index of a given (item, set). */
export function stepIndexOf(steps, item, set) {
  return steps.findIndex((st) => st.item === item && st.set === set);
}

/** Next open set of the same exercise after a given set index, or null. */
export function nextOpenSetOfItem(item, afterSet) {
  for (let i = afterSet + 1; i < item.sets.length; i++) if (isOpen(item.sets[i])) return i;
  return null;
}

export function progressOf(items) {
  let total = 0;
  let done = 0;
  for (const it of items)
    for (const s of it.sets) {
      if (s.status === 'skipped') continue;
      total++;
      if (s.status === 'done') done++;
    }
  return { done, total };
}

/**
 * "Speed dropping" on a power exercise: remaining sets are marked as not done, without penalty.
 * Returns a new items array.
 */
export function stopItemRemaining(items, itemIndex) {
  return items.map((it, i) => {
    if (i !== itemIndex) return it;
    return { ...it, sets: it.sets.map((s) => (isOpen(s) ? { ...s, status: 'skipped', skipReason: 'speed' } : s)) };
  });
}

/** Add one extra working set at the end of an exercise (copy of its last set). */
export function addSet(items, itemIndex) {
  return items.map((it, i) => {
    if (i !== itemIndex) return it;
    const last = it.sets[it.sets.length - 1];
    const extra = { ...last, index: it.sets.length, kind: last.kind === 'top' ? 'work' : last.kind, status: 'todo', actual: null, recordId: null, extra: true };
    return { ...it, sets: [...it.sets, extra] };
  });
}

/** Skip one planned set (no penalty, no effect on progression). */
export function skipSet(items, itemIndex, setIndex) {
  return items.map((it, i) => {
    if (i !== itemIndex) return it;
    return { ...it, sets: it.sets.map((s, j) => (j === setIndex && isOpen(s) ? { ...s, status: 'skipped', skipReason: 'user' } : s)) };
  });
}

/**
 * Stop a session: validated sets stay as they are; open sets stay exactly as planned
 * (no proposal change, no progression, no failure). The session becomes partial.
 */
export function stopSession(session, nowIso) {
  return { ...session, status: 'partial', endedAt: nowIso };
}

export function isSessionFinished(items) {
  return items.every((it) => it.sets.every((s) => !isOpen(s)));
}
