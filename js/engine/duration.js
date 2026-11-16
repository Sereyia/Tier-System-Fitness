// Estimated session duration (work only, warm-up excluded).
// Estimate: 45 s per set plus the advised rest after each set except the last one.

import { buildOrder, restAfter } from './session-flow.js';

export const SECONDS_PER_SET = 45;
export const MAX_WORK_MINUTES = 80;

export function estimateMinutes(items, supersetSettings, split = []) {
  const steps = buildOrder(items, split);
  let seconds = 0;
  steps.forEach((_, i) => {
    seconds += SECONDS_PER_SET;
    if (i < steps.length - 1) seconds += restAfter(items, steps, i, supersetSettings);
  });
  return Math.round(seconds / 60);
}

export function exceedsMaxDuration(minutes) {
  return minutes > MAX_WORK_MINUTES;
}
