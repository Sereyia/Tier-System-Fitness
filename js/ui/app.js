// App shell: boot, routing, bottom navigation, Service Worker updates, Wake Lock, persistent storage.

import * as db from '../data/db.js';
import { setVibration, h } from './components.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderHome } from './screens/home.js';
import { renderPreview } from './screens/preview.js';
import { renderExerciseSheet } from './screens/exercise-sheet.js';
import { renderSet } from './screens/set.js';
import { renderRest } from './screens/rest.js';
import { renderOverview } from './screens/overview.js';
import { renderCongrats, renderSummary } from './screens/end.js';
import { renderSettings } from './screens/settings.js';
import { renderProgramView } from './screens/program-view.js';
import { renderHistoryList } from './screens/history-list.js';

export const APP_VERSION = '1.0.0';

const SCREENS = {
  onboarding: renderOnboarding,
  home: renderHome,
  preview: renderPreview,
  exercise: renderExerciseSheet,
  set: renderSet,
  rest: renderRest,
  overview: renderOverview,
  congrats: renderCongrats,
  summary: renderSummary,
  settings: renderSettings,
  program: renderProgramView,
  history: renderHistoryList,
};

const TABS = [
  ['home', 'Accueil'],
  ['program', 'Programme'],
  ['history', 'Historique'],
  ['settings', 'Réglages'],
];

const SESSION_SCREENS = new Set(['set', 'rest', 'overview', 'exercise-in-session', 'congrats']);

export const app = {
  root: null,
  screen: null,
  params: {},
  settings: null,
  state: null,
  program: null,
  exercises: null,
  bodyweight: null,
  session: null,
  swWaiting: null,
  persisted: null,
  timers: [],
  go,
  reload,
  refreshData,
  applySettings,
};

function clearTimers() {
  for (const t of app.timers) clearInterval(t);
  app.timers = [];
}

export async function go(screen, params = {}) {
  clearTimers();
  document.querySelectorAll('.overlay, .toast').forEach((el) => { if (!params.keepToast || !el.classList.contains('toast')) el.remove(); });
  app.screen = screen;
  app.params = params;
  const inSession = SESSION_SCREENS.has(screen) || (screen === 'exercise' && params.inSession);
  app.root.innerHTML = '';
  const main = document.createElement('main');
  main.className = `screen${inSession ? ' session' : ''}`;
  main.id = 'main';
  app.root.appendChild(main);
  if (!inSession && screen !== 'onboarding' && screen !== 'summary' && screen !== 'preview' && screen !== 'exercise') app.root.appendChild(tabBar(screen));
  await SCREENS[screen](app, main, params);
  updateWakeLock(inSession || screen === 'congrats');
  window.scrollTo(0, 0);
}

function tabBar(active) {
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Navigation principale');
  nav.innerHTML = `<div class="inner">${TABS.map(([id, label]) => `
    <button type="button" class="btn ${id === active ? 'btn-selected' : 'btn-orange'}" data-tab="${id}" ${id === active ? 'aria-current="page"' : ''}>${h(label)}</button>`).join('')}</div>`;
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) go(b.dataset.tab);
  });
  return nav;
}

export async function refreshData() {
  app.settings = await db.getSettings();
  app.state = await db.getState();
  app.program = await db.getProgram(app.state.programId || 'default');
  app.exercises = await db.getExercisesById();
  const bw = await db.latestBodyweight();
  app.bodyweight = bw ? bw.kg : null;
  app.session = app.state.activeSessionId ? await db.getSession(app.state.activeSessionId) : null;
  if (app.session && app.session.status !== 'in_progress') app.session = null;
  applySettings();
}

export function applySettings() {
  setVibration(app.settings.vibration !== false);
  document.documentElement.classList.toggle('large-text', !!app.settings.largeText);
}

async function reload() {
  await refreshData();
  await go(app.state.onboardingDone ? 'home' : 'onboarding');
}

// ---------- Wake Lock ----------
let wakeLock = null;
let wantWake = false;

async function updateWakeLock(want) {
  wantWake = want && app.settings?.wakeLock !== false;
  if (!('wakeLock' in navigator)) return;
  try {
    if (wantWake && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!wantWake && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* denied or not visible */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) updateWakeLock(true);
});

// ---------- Persistent storage ----------
async function requestPersist() {
  try {
    if (navigator.storage?.persist) {
      app.persisted = await navigator.storage.persisted();
      if (!app.persisted) app.persisted = await navigator.storage.persist();
    }
  } catch {
    app.persisted = null;
  }
}

// ---------- Service Worker ----------
let userAskedUpdate = false;

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(sw);
      });
    });
    // Check for a new version at each opening.
    reg.update().catch(() => {});
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userAskedUpdate) location.reload();
  });
}

function onWaiting(sw) {
  app.swWaiting = sw;
  if (app.screen === 'home' && !app.session) go('home');
}

export function applyUpdate() {
  if (!app.swWaiting) return;
  userAskedUpdate = true;
  app.swWaiting.postMessage({ type: 'SKIP_WAITING' });
}

// ---------- Boot ----------
async function boot() {
  app.root = document.getElementById('app');
  try {
    await db.openDb();
    await db.ensureSeed();
    await refreshData();
  } catch (e) {
    app.root.innerHTML = `<main class="screen"><div class="card"><h1>Stockage indisponible</h1><p>${h(e.message || e)}</p>
      <p class="muted">L’appli a besoin d’IndexedDB. La navigation privée peut le bloquer.</p></div></main>`;
    return;
  }
  requestPersist();
  registerSW();
  if (!app.state.onboardingDone) return go('onboarding');
  return go('home');
}

boot();
