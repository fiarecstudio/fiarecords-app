const CACHE_NAME = "fia-cache-v4"; // <-- v4 para forzar actualización tras ESM
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/js/app.js",
  "/js/api.js",
  "/js/ui.js",
  "/js/drive.js",
  "/js/pdf.js",
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
  // Ignorar requests de extensiones de Chrome (causan errores)
  if (event.request.url.startsWith('chrome-extension://')) return;
  if (event.request.url.startsWith('moz-extension://')) return;
  
  // Solo cacheamos GET. El navegador prohíbe cache.put() con POST/PUT/DELETE.
  if (event.request.method !== 'GET') return;
  
  // Solo cacheamos http/https (no chrome-extension, etc.)
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  
  // Estrategia: Network First (Red primero, si falla, usa Caché)
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse.status === 206) {
          return networkResponse;
        }
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