// Service Worker: caches every app file for a 100 % offline use after the first visit.
// Bump CACHE_VERSION at each publication. The new version waits until the user taps "Mettre à jour".

const CACHE_VERSION = 'muscu-v1.0.0';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/theme.css',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './js/data/backup.js',
  './js/data/db.js',
  './js/data/seed.js',
  './js/engine/dates.js',
  './js/engine/duration.js',
  './js/engine/intensity.js',
  './js/engine/load.js',
  './js/engine/program.js',
  './js/engine/rotation.js',
  './js/engine/session-flow.js',
  './js/engine/theme.js',
  './js/ui/app.js',
  './js/ui/components.js',
  './js/ui/session.js',
  './js/ui/screens/end.js',
  './js/ui/screens/exercise-sheet.js',
  './js/ui/screens/history-list.js',
  './js/ui/screens/home.js',
  './js/ui/screens/onboarding.js',
  './js/ui/screens/overview.js',
  './js/ui/screens/preview.js',
  './js/ui/screens/program-view.js',
  './js/ui/screens/rest.js',
  './js/ui/screens/set.js',
  './js/ui/screens/settings.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache so a new version gets fresh files.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
  // No skipWaiting here: the page asks for it when the user taps "Mettre à jour".
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('muscu-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      return fetch(req);
    }),
  );
});
