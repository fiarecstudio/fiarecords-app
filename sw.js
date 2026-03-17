const CACHE_NAME = "fia-cache-v3"; // <-- ¡Subimos a v3 para forzar la actualización!
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
  // Este paso elimina las cachés viejas (como la v2 que tiene tu celular atascada)
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de inmediato
  );
});

self.addEventListener("fetch", event => {
  // Estrategia: Network First (Red primero, si falla, usa Caché)
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Si hay internet, guardamos la versión MÁS NUEVA en la caché
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Si no hay internet (offline), devolvemos lo que tengamos en caché
        return caches.match(event.request);
      })
  );
});