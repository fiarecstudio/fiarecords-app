const CACHE_NAME = 'fia-studio-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // Iconos y librerías externas (CDN)
  // Nota: Las CDNs a veces fallan offline si no tienen CORS habilitado, 
  // pero intentaremos cachearlas. Lo ideal es descargar estos archivos .js y .css localmente.
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://npmcdn.com/flatpickr/dist/l10n/es.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/toastify-js',
  'https://placehold.co/180x80?text=FiaRecords'
];

// Instalar SW y cachear recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cacheando archivos del sistema...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia de carga: Cache First, falling back to Network
// (Primero busca en cache, si no está, usa internet)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Si está en cache, retornarlo
      if (response) {
        return response;
      }
      // Si no, buscar en internet
      return fetch(event.request).catch(() => {
        // Si falla internet y no está en cache (offline total)
        // Podríamos retornar una página offline genérica aquí si quisiéramos
      });
    })
  );
});