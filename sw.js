/* Rocket Rumble — offline-first service worker (stale-while-revalidate).
   Bump CACHE on every release or phones will keep serving the old build. */
var CACHE = 'rocket-rumble-v2';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/three.min.js',
  './js/core.js',
  './js/audio.js',
  './js/arena.js',
  './js/car.js',
  './js/ball.js',
  './js/ai.js',
  './js/fx.js',
  './js/levels.js',
  './js/input.js',
  './js/ui.js',
  './js/game.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/favicon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(e.request).then(function (res) {
          if (res && res.ok) c.put(e.request, res.clone());
          return res;
        }).catch(function () { return hit; });
        /* instant from cache, refresh quietly in the background */
        return hit || net;
      });
    })
  );
});
