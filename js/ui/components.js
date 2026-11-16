// Small UI helpers: escaping, sheets, hold-to-confirm, banners, vibration, formatting.

import { formatNumber } from '../engine/dates.js';

export function h(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let vibrationOn = true;
export function setVibration(on) {
  vibrationOn = on;
}
export function vibrate(pattern) {
  if (!vibrationOn) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* not supported */ }
}

/** Load display: "107,5" ; body-weight exercises show the added load with a sign. */
export function fmtLoad(load, exercise) {
  if (load == null) return '?';
  const s = formatNumber(load);
  if (exercise && (exercise.equipment === 'weighted_bodyweight' || exercise.equipment === 'bodyweight')) {
    return load > 0 ? `+${s}` : s;
  }
  return s;
}

export function loadUnit(exercise) {
  if (!exercise) return 'kg';
  if (exercise.equipment === 'dumbbell') return 'kg par haltère';
  if (exercise.equipment === 'weighted_bodyweight' || exercise.equipment === 'bodyweight') return 'kg de lest';
  return 'kg';
}

export function repsUnit(exercise) {
  if (exercise.unit === 'distance') return exercise.perSide ? 'm par côté' : 'm';
  if (exercise.unit === 'time') return exercise.perSide ? 's par côté' : 's';
  return exercise.perSide ? 'reps par côté' : 'reps';
}

export function rirLabel(rir, settings) {
  if (rir == null) return '';
  if (settings?.rirDisplay === 'rpe') return `RPE ${formatNumber(10 - rir)}`;
  return `RIR ${formatNumber(rir)}`;
}

export function rirRangeText(range, settings) {
  if (!range) return '';
  const [a, b] = settings?.rirDisplay === 'rpe' ? [10 - range[1], 10 - range[0]] : range;
  return a === b ? formatNumber(a) : `${formatNumber(a)}-${formatNumber(b)}`;
}

/**
 * Bottom sheet with large buttons.
 * actions: [{ label, kind: 'orange' | 'green' | 'red', onClick, hold }]
 */
export function openSheet({ title, body = '', actions = [], dismissable = true, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${h(title || 'Options')}">
      ${title ? `<h2>${h(title)}</h2>` : ''}
      <div class="sheet-body">${body}</div>
      <div class="list sheet-actions"></div>
    </div>`;
  const list = overlay.querySelector('.sheet-actions');
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) close();
  };
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-${a.kind || 'orange'} btn-block btn-big`;
    if (a.hold) {
      makeHoldButton(b, a.label, () => a.onClick(close));
    } else {
      b.textContent = a.label;
      b.addEventListener('click', () => a.onClick(close));
    }
    list.appendChild(b);
  });
  if (dismissable) overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  const first = overlay.querySelector('input, textarea, select') || overlay.querySelector('.btn');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, el: overlay };
}

/** "Hold to confirm" button: keep pressed 2 seconds, releasing earlier cancels. */
export function makeHoldButton(button, label, onConfirm, ms = 2000) {
  button.classList.add('hold');
  button.innerHTML = `<div class="gauge"></div><span>${h(label)}</span>`;
  button.setAttribute('aria-label', `${label} (maintenir 2 secondes)`);
  const gauge = button.querySelector('.gauge');
  let start = 0;
  let raf = 0;
  let done = false;
  const reset = () => {
    cancelAnimationFrame(raf);
    start = 0;
    gauge.style.width = '0';
  };
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / ms);
    gauge.style.width = `${p * 100}%`;
    if (p >= 1) {
      done = true;
      reset();
      vibrate(80);
      onConfirm();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (done) return;
    start = performance.now();
    raf = requestAnimationFrame(tick);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(ev, () => { if (!done) reset(); });
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard: hold Space or Enter.
  button.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !start && !done) {
      e.preventDefault();
      start = performance.now();
      raf = requestAnimationFrame(tick);
    }
  });
  button.addEventListener('keyup', () => { if (!done) reset(); });
}

/** Temporary banner at the bottom (e.g. "Série enregistrée · Annuler"). */
export function showToast(text, { actionLabel, onAction, timeout = 5000 } = {}) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast banner';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="grow">${h(text)}</div>`;
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-orange';
    b.textContent = actionLabel;
    b.addEventListener('click', () => {
      el.remove();
      onAction();
    });
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const t = setTimeout(() => el.remove(), timeout);
  return () => {
    clearTimeout(t);
    el.remove();
  };
}

/** Number entry sheet. Resolves with a number or null if cancelled. */
export function askNumber({ title, value, unit, step = 'any', allowNegative = false, extraHtml = '', onInput }) {
  return new Promise((resolve) => {
    let settled = false;
    const sheet = openSheet({
      title,
      body: `
        <label class="field"><span class="sr-only">${h(title)}</span>
          <input class="big-input" type="number" inputmode="decimal" step="${step}" ${allowNegative ? '' : 'min="0"'} value="${value ?? ''}" aria-label="${h(title)}">
        </label>
        <p class="muted center">${h(unit || '')}</p>
        ${extraHtml}`,
      actions: [
        { label: 'Valider', kind: 'green', onClick: (close) => {
          const raw = sheet.el.querySelector('input').value.replace(',', '.');
          const n = raw === '' ? null : Number(raw);
          settled = true;
          close();
          resolve(n == null || Number.isNaN(n) ? null : n);
        } },
        { label: 'Annuler', kind: 'orange', onClick: (close) => { settled = true; close(); resolve(null); } },
      ],
      onClose: () => { if (!settled) resolve(null); },
    });
    const input = sheet.el.querySelector('input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sheet.el.querySelector('.btn-green').click(); });
    input.addEventListener('focus', () => input.select());
    if (onInput) {
      const update = () => onInput(Number(input.value.replace(',', '.')), sheet.el);
      input.addEventListener('input', update);
      update();
    }
  });
}

/** Long press on - / + repeats quickly. */
export function bindRepeat(button, fn) {
  let timer = null;
  let interval = null;
  let fired = false;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(interval);
    timer = null;
    interval = null;
  };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fired = false;
    fn();
    fired = true;
    timer = setTimeout(() => { interval = setInterval(fn, 90); }, 450);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(ev, stop);
  button.addEventListener('click', (e) => {
    // Keyboard activation (no pointer event).
    if (e.detail === 0 && !fired) fn();
    fired = false;
  });
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
