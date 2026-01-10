const CACHE_NAME = 'fiarecords-v2-offline-pro';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://npmcdn.com/flatpickr/dist/l10n/es.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
  'https://cdn.jsdelivr.net/npm/toastify-js',
  'https://placehold.co/180x80?text=FiaRecords',
  'https://placehold.co/150x60?text=Cargando...',
  'https://placehold.co/150x60?text=Firma'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets críticos');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ESTRATEGIA PARA API (Network Only / Controlled by App Logic)
  // Las llamadas a API las dejamos pasar, el manejo offline lo hace el JS del cliente
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) {
    return; 
  }

  // ESTRATEGIA PARA ESTÁTICOS (Stale-While-Revalidate)
  // Intenta servir caché rápido, pero actualiza en segundo plano si hay red.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Solo cacheamos respuestas válidas
        if(networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
          // Si falla red y no hay cache, no hacemos nada (el match retornará undefined)
      });
      return cachedResponse || fetchPromise;
    })
  );
});