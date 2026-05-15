// CACHE BUSTED: v40 - forces fresh load of all JS/CSS
const CACHE_NAME = 'trading-dashboard-v40';

// Do NOT cache JS files - always fetch fresh from network
const urlsToCache = [
  './index.html',
  './css/styles.css',
  './css/mobile.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // CRITICAL: Never cache JS files - always network
  if (url.pathname.endsWith('.js')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
});
