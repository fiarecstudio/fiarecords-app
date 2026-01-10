const CACHE_NAME = 'fiarecords-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // Iconos (asegúrate de tenerlos)
  './icon-192.png',
  './icon-512.png',
  // Librerías CDN (Copiadas de tu HTML)
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://npmcdn.com/flatpickr/dist/l10n/es.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
  'https://cdn.jsdelivr.net/npm/toastify-js'
];

// 1. Instalación: Guardar archivos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activación: Limpiar cachés viejos si actualizas la versión
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// 3. Fetch: Servir desde caché, si no hay red, usa caché.
// Si es una petición a la API (/api/), intenta red primero.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Si es una llamada a la API, usamos Network First (intentar internet, si falla, error o cache offline si implementaste eso)
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Aquí podrías retornar una respuesta JSON offline personalizada si quisieras
        return new Response(JSON.stringify({ error: 'Modo Offline' }), {
            headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Para el resto (HTML, CSS, JS, Imágenes), usamos Cache First (Cache primero, luego red)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});