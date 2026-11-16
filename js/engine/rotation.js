// Rotation and cycle counting. Pure module.

/** Rotation index after a session. A partial session moves on unless repeatPartial is set. */
export function nextRotationIndex(doneIndex, rotationLength, { status = 'complete', repeatPartial = false } = {}) {
  if (status === 'partial' && repeatPartial) return doneIndex;
  return (doneIndex + 1) % rotationLength;
}

/** Sessions planned in a cycle: rotations x rotation length (36 by default). */
export function plannedSessions(cycle, rotationLength) {
  return (cycle.rotations || 4) * rotationLength;
}

/**
 * Cycle progress. Complete and partial sessions both count (a deload counts too).
 * Returns { done, total, current, finished, ratio }.
 */
export function cycleProgress(cycle, sessionsOfCycle, rotationLength) {
  const total = plannedSessions(cycle, rotationLength);
  const done = sessionsOfCycle.filter((s) => s.status === 'complete' || s.status === 'partial').length;
  return {
    done,
    total,
    current: Math.min(done + 1, total),
    finished: done >= total,
    ratio: total ? Math.min(1, done / total) : 0,
  };
}

/** Monday 00:00 (local) of the week containing date d. */
export function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

/**
 * Estimated end date from the real pace of the last 4 weeks.
 * The pace is measured over min(28 days, days since the cycle start); with less than 14 days
 * of data, the planned number of sessions per week is used instead.
 */
export function estimateEndDate(sessionDates, remaining, now = new Date(), { cycleStart = null, perWeek = 3 } = {}) {
  if (remaining <= 0) return new Date(now);
  const sinceStart = cycleStart ? (now - new Date(cycleStart)) / 86400000 : 28;
  const span = Math.min(28, sinceStart);
  let perDay = perWeek / 7;
  if (span >= 14) {
    const windowStart = new Date(now.getTime() - span * 86400000);
    const recent = sessionDates.map((d) => new Date(d)).filter((d) => d >= windowStart && d <= now);
    if (recent.length) perDay = recent.length / span;
  }
  const end = new Date(now);
  end.setDate(end.getDate() + Math.ceil(remaining / perDay));
  return end;
}

/** Sessions done this week (Monday to Sunday). */
export function sessionsThisWeek(sessions, now = new Date()) {
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return sessions.filter((s) => {
    if (s.status !== 'complete' && s.status !== 'partial') return false;
    const d = new Date(s.startedAt);
    return d >= start && d < end;
  }).length;
}
