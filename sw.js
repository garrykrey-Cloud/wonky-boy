/* Wonky Boy - sw.js
 * The whole game is static files, so it caches cleanly and plays offline.
 * Progress lives in localStorage, which the service worker never touches.
 *
 * Bump CACHE when you ship, or phones will keep serving the old build.
 */
'use strict';

const CACHE = 'wonky-boy-v8';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/theme.js',
  './js/rng.js',
  './js/hazards.js',
  './js/maze.js',
  './js/effects.js',
  './js/player.js',
  './js/entities.js',
  './js/render.js',
  './js/haunted.js',
  './js/furniture.js',
  './js/paintings.js',
  './js/carpet.js',
  './js/maze3d.js',
  './js/corridor.js',
  './js/splash.js',
  './js/backbutton.js',
  './js/game.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network first, falling back to cache, so a fresh deploy is picked up as
 * soon as the phone has signal but the game still runs on the train. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
