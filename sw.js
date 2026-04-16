const CACHE_NAME = 'trading-dashboard-v2';
const urlsToCache = [
  './',
  './index.html',
  './css/styles.css',
  './css/mobile.css',
  './js/app.js',
  './js/data.js',
  './js/simulation.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Network-First Strategy for real-time app
  event.respondWith(
    fetch(event.request).catch(() => {
      // Offline fallback
      return caches.match(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
