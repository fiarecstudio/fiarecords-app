const CACHE_PREFIX = "fia-cache-";
const CACHE_NAME = "fia-cache-v5";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json"
];

self.addEventListener("install", event => {
  self.skipWaiting(); // Obliga al nuevo Service Worker a instalarse inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});


self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de inmediato
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const cacheableDestinations = ['document', 'script', 'style', 'image', 'font', 'worker'];
  const isManifest = url.pathname === '/manifest.json';
  if (!isManifest && !cacheableDestinations.includes(event.request.destination)) return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (!networkResponse.ok || networkResponse.status === 206) return networkResponse;
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone()).catch(() => {});
          return networkResponse;
        });
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === 'navigate') {
          return cache.match('/index.html');
        }
        return Response.error();
      })
  );
});