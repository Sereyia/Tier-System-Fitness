// Session controller: builds a session from the program, persists each set, handles undo and end.

import * as db from '../data/db.js';
import { buildSessionPlan, referenceTargetFor, blockById } from '../engine/program.js';
import { proposeSetLoad, recalcNextSet, setE1rm, bestE1rm, loadModeOf } from '../engine/load.js';
import { buildOrder, nextOpenStep, isSessionFinished, stopItemRemaining, addSet, skipSet, nextOpenSetOfItem } from '../engine/session-flow.js';
import { nextRotationIndex } from '../engine/rotation.js';
import { localIso, formatNumber } from '../engine/dates.js';
import { fmtLoad } from './components.js';

/** Last time: same set in the same block type, otherwise the last exposure in any block. */
function lastTimeFor(history, blockType, set) {
  const pick = (h) => {
    const sameKind = h.sets.filter((s) => s.kind === set.kind && !s.skipped);
    const list = sameKind.length ? sameKind : h.sets;
    return list.find((s) => s.setIndex === set.index) || list[Math.min(set.index, list.length - 1)] || null;
  };
  const same = history.find((h) => h.blockType === blockType && h.sets.length);
  if (same) {
    const s = pick(same);
    if (s) return { ...slim(s), sameBlock: true };
  }
  const any = history.find((h) => h.sets.length);
  if (any) {
    const s = pick(any);
    if (s) return { ...slim(s), sameBlock: false, blockName: s.blockName || null };
  }
  return null;
}

function slim(s) {
  return { load: s.load, reps: s.reps, rir: s.rir, speed: s.speed ?? null, date: s.date, blockName: s.blockName || null };
}

/** Build a session (not saved yet) with load proposals for every planned set. */
export async function prepareSession(app, rotationIndex, { manual = false } = {}) {
  const program = app.program;
  const entry = program.rotation[rotationIndex];
  const plan = buildSessionPlan(program, entry, app.exercises);
  const block = blockById(program, entry.blockId);
  const refs = await db.getReferences();
  const bw = app.bodyweight;
  const items = [];
  for (const it of plan.items) {
    const exercise = app.exercises[it.exerciseId];
    const history = await db.exerciseHistory(it.exerciseId);
    const slot = program.sessionTypes.find((t) => t.id === entry.sessionTypeId).slots.find((s) => s.id === it.slotId);
    const ctx = {
      block,
      coef: it.coef,
      reference: refs[it.exerciseId]?.load ?? null,
      referenceTarget: referenceTargetFor(program, slot),
      bodyweight: bw,
      settings: app.settings.equipment,
    };
    const sets = it.sets.map((set) => {
      const p = proposeSetLoad(exercise, set, history, ctx);
      return {
        ...set,
        proposed: p.load,
        source: p.source,
        guaranteed: p.guaranteed,
        status: 'todo',
        actual: null,
        recordId: null,
        last: lastTimeFor(history, plan.blockType, set),
      };
    });
    const allPast = history.flatMap((h) => h.sets);
    items.push({ ...it, sets, best: bestE1rm(allPast, exercise, bw), note: it.note });
  }
  return {
    id: db.newId(),
    status: 'planned',
    startedAt: null,
    endedAt: null,
    cycleId: app.state.currentCycleId,
    rotationIndex,
    manual,
    blockId: plan.blockId,
    blockName: plan.blockName,
    blockType: plan.blockType,
    sessionTypeId: plan.sessionTypeId,
    sessionName: plan.sessionName,
    items,
    split: [],
    cursor: 0,
    rest: null,
    fatigue: null,
    notes: {},
  };
}

export function stepsOf(session) {
  return buildOrder(session.items, session.split);
}

export async function startSession(app, session) {
  session.status = 'in_progress';
  session.startedAt = localIso();
  session.cursor = nextOpenStep(session.items, stepsOf(session), -1);
  await db.saveSession(session);
  app.state = await db.saveState({ activeSessionId: session.id });
  app.session = session;
  return session;
}

export function currentStep(session) {
  const steps = stepsOf(session);
  return { steps, step: steps[session.cursor], index: session.cursor };
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

let undoStack = null;

/**
 * Validate the current set with actual values { load, reps, rir, speed }.
 * Writes the set and the session in one transaction. Returns { finished, record, pr, message }.
 */
export async function validateSet(app, values) {
  const session = app.session;
  const { steps, step } = currentStep(session);
  const item = session.items[step.item];
  const set = item.sets[step.set];
  const exercise = app.exercises[item.exerciseId];
  const before = clone(session);
  const stateBefore = { rotationIndex: app.state.rotationIndex, activeSessionId: app.state.activeSessionId };

  const record = {
    id: db.newId(),
    sessionId: session.id,
    cycleId: session.cycleId,
    exerciseId: item.exerciseId,
    slotId: item.slotId,
    tier: item.tier,
    date: localIso(),
    blockId: session.blockId,
    blockName: session.blockName,
    blockType: session.blockType,
    coef: item.coef,
    sessionTypeId: session.sessionTypeId,
    kind: set.kind,
    setIndex: set.index,
    load: values.load ?? null,
    reps: values.reps ?? null,
    rir: values.rir ?? null,
    speed: values.speed ?? null,
    unit: exercise.unit,
    repsRange: set.repsRange,
    rirRange: set.rir,
    proposed: set.proposed,
    bodyweight: app.bodyweight ?? null,
    extra: !!set.extra,
  };
  const e1 = setE1rm(record, exercise, app.bodyweight);
  const pr = e1 != null && item.best != null && e1 > item.best + 1e-9;
  record.e1rm = e1;
  record.pr = pr;
  if (e1 != null && (item.best == null || e1 > item.best)) item.best = e1;

  set.status = 'done';
  set.actual = { load: record.load, reps: record.reps, rir: record.rir, speed: record.speed };
  set.recordId = record.id;
  set.pr = pr;

  // First exposure without history: the entered load becomes the reference (Force equivalent).
  if (set.source === 'ask' && record.load != null && loadModeOf(exercise, set) !== 'power') {
    const coef = item.coef || 1;
    await db.setReference(item.exerciseId, Math.round((record.load / coef) * 100) / 100, 'first-exposure');
    for (const s of item.sets) if (s.status === 'todo' && s.proposed == null) { s.proposed = record.load; s.source = 'session'; }
  }

  // Recalculate the remaining sets of this exercise from the actual values.
  let message = null;
  for (const s of item.sets) {
    if (s.status !== 'todo' || s.index <= set.index) continue;
    const r = recalcNextSet({ exercise, done: record, next: s, currentProposal: s.proposed, bodyweight: app.bodyweight, settings: app.settings.equipment });
    if (r.changed && r.load != null && s.proposed != null && r.load !== s.proposed) {
      if (!message) {
        const up = r.load > s.proposed;
        message = `Ta série ${set.index + 1} à ${fmtLoad(record.load, exercise)} kg ${up ? 'était solide' : 'a été plus dure que prévu'} : ${fmtLoad(r.load, exercise)} kg proposés pour la série ${s.index + 1}`;
      }
      s.proposed = r.load;
    } else if (r.load != null && s.proposed == null) {
      s.proposed = r.load;
    }
  }

  const finished = isSessionFinished(session.items);
  if (finished) {
    session.status = 'complete';
    session.endedAt = localIso();
    session.rest = null;
    const idx = nextRotationIndex(session.rotationIndex, app.program.rotation.length, { status: 'complete' });
    await db.saveSetWithSession(record, session);
    app.state = await db.saveState({ rotationIndex: idx, activeSessionId: null });
  } else {
    session.rest = { afterStep: session.cursor, at: record.date, message, speedDown: values.speed === 'down' && nextOpenSetOfItem(item, set.index) != null };
    await db.saveSetWithSession(record, session);
  }
  undoStack = { session: before, recordId: record.id, state: stateBefore };
  return { finished, record, pr, message, steps };
}

export function canUndo() {
  return !!undoStack;
}

/** Undo the last validated set (5 s banner or "Annuler la dernière action"). */
export async function undoLast(app) {
  if (!undoStack) return false;
  const { session, recordId, state } = undoStack;
  undoStack = null;
  await db.deleteSetWithSession(recordId, session);
  app.state = await db.saveState(state);
  app.session = session;
  return true;
}

export function clearUndo() {
  undoStack = null;
}

/** Move to the next open set after the rest screen. Returns false if none (should not happen). */
export async function goNext(app) {
  const s = app.session;
  const steps = stepsOf(s);
  const next = nextOpenStep(s.items, steps, s.rest ? s.rest.afterStep : s.cursor);
  s.rest = null;
  if (next < 0) return false;
  s.cursor = next;
  await db.saveSession(s);
  clearUndo();
  return true;
}

export async function jumpTo(app, itemIndex) {
  const s = app.session;
  const steps = stepsOf(s);
  const target = s.items[itemIndex];
  const paired = target.group && !s.split.includes(target.group);
  const inScope = (st) => st.item === itemIndex || (paired && s.items[st.item].group === target.group);
  const i = steps.findIndex((st) => inScope(st) && s.items[st.item].sets[st.set].status === 'todo');
  if (i < 0) return false;
  s.cursor = i;
  s.rest = null;
  await db.saveSession(s);
  clearUndo();
  return true;
}

export async function stopPowerExercise(app) {
  const s = app.session;
  const steps = stepsOf(s);
  const st = steps[s.rest ? s.rest.afterStep : s.cursor];
  s.items = stopItemRemaining(s.items, st.item);
  if (s.rest) s.rest.speedDown = false;
  return finishIfDone(app);
}

export async function addExtraSet(app) {
  const s = app.session;
  const st = currentStep(s).step;
  s.items = addSet(s.items, st.item);
  await db.saveSession(s);
}

export async function skipCurrentSet(app) {
  const s = app.session;
  const st = currentStep(s).step;
  s.items = skipSet(s.items, st.item, st.set);
  s.rest = null;
  const steps = stepsOf(s);
  const next = nextOpenStep(s.items, steps, s.cursor);
  if (next >= 0) s.cursor = next;
  return finishIfDone(app);
}

async function finishIfDone(app) {
  const s = app.session;
  if (isSessionFinished(s.items)) {
    const anyDone = s.items.some((it) => it.sets.some((x) => x.status === 'done'));
    s.status = anyDone ? 'complete' : 'partial';
    s.endedAt = localIso();
    s.rest = null;
    await db.saveSession(s);
    const idx = nextRotationIndex(s.rotationIndex, app.program.rotation.length, { status: s.status, repeatPartial: app.settings.repeatPartial });
    app.state = await db.saveState({ rotationIndex: idx, activeSessionId: null });
    return { finished: true };
  }
  await db.saveSession(s);
  return { finished: false };
}

/** Undo a pair for this session only ("Faire séparément"). */
export async function splitCurrentPair(app) {
  const s = app.session;
  const { step } = currentStep(s);
  const item = s.items[step.item];
  if (!item.group || s.split.includes(item.group)) return;
  s.split = [...s.split, item.group];
  const steps = stepsOf(s);
  s.cursor = steps.findIndex((st) => st.item === step.item && st.set === step.set);
  await db.saveSession(s);
}

/** Stop the session: validated sets stay, open sets are left exactly as planned. */
export async function stopSession(app) {
  const s = app.session;
  s.status = 'partial';
  s.endedAt = localIso();
  s.rest = null;
  await db.saveSession(s);
  const idx = nextRotationIndex(s.rotationIndex, app.program.rotation.length, { status: 'partial', repeatPartial: app.settings.repeatPartial });
  app.state = await db.saveState({ rotationIndex: idx, activeSessionId: null });
  clearUndo();
}

/** Edit an already validated set (from the overview). */
export async function editDoneSet(app, itemIndex, setIndex, values) {
  const s = app.session;
  const item = s.items[itemIndex];
  const set = item.sets[setIndex];
  const all = await db.getAllByIndex('sets', 'sessionId', s.id);
  const rec = all.find((r) => r.id === set.recordId);
  if (!rec) return;
  Object.assign(rec, { load: values.load, reps: values.reps, rir: values.rir, speed: values.speed ?? rec.speed });
  const exercise = app.exercises[item.exerciseId];
  rec.e1rm = setE1rm(rec, exercise, app.bodyweight);
  set.actual = { load: rec.load, reps: rec.reps, rir: rec.rir, speed: rec.speed };
  await db.saveSetWithSession(rec, s);
}

export async function saveNote(app, itemIndex, text) {
  const s = app.session;
  s.notes = { ...(s.notes || {}), [s.items[itemIndex].slotId]: text };
  await db.saveSession(s);
}

export async function saveFatigue(session, value) {
  session.fatigue = value;
  await db.saveSession(session);
}

/** Summary numbers of a session. */
export async function summaryOf(app, session) {
  const records = await db.getAllByIndex('sets', 'sessionId', session.id);
  const start = new Date(session.startedAt);
  const end = new Date(session.endedAt || Date.now());
  let tonnage = 0;
  const volume = {};
  const counted = new Set();
  for (const r of records) {
    const ex = app.exercises[r.exerciseId];
    if (r.unit === 'reps' && r.load > 0 && r.reps) tonnage += r.load * r.reps;
    if (!ex || r.kind === 'power') continue;
    for (const m of ex.muscles.direct) volume[m] = (volume[m] || 0) + 1;
    for (const m of ex.muscles.indirect) volume[m] = (volume[m] || 0) + 0.5;
    counted.add(r.exerciseId);
  }
  return {
    minutes: Math.round((end - start) / 60000),
    sets: records.length,
    tonnage: Math.round(tonnage),
    prs: records.filter((r) => r.pr).map((r) => ({ name: app.exercises[r.exerciseId]?.name, e1rm: r.e1rm, load: r.load, reps: r.reps })),
    volume,
  };
}

export function prText(pr) {
  return `${pr.name} : ${formatNumber(pr.load)} kg x ${pr.reps}, max estimé ${formatNumber(pr.e1rm)} kg`;
}
