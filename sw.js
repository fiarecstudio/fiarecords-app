// ==================================================================
//             SW.JS - CORREGIDO (ESTRATEGIA DE CACHÉ MEJORADA)
// ==================================================================
const CACHE_NAME = 'fia-studio-v4'; // Se incrementa la versión para forzar la actualización
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './script.js',
  // Iconos y librerías externas (CDN)
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
            console.log('Borrando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia de carga: Network First para API, Cache First para el resto
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // CORRECCIÓN: Si es una petición a la API, usa la estrategia "Network First"
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Si la respuesta de red es válida, la clonamos y la guardamos en caché para offline
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Si la red falla, intentamos obtenerla del caché
          return caches.match(request);
        })
    );
    return;
  }

  // Para todas las demás peticiones (archivos estáticos), usa "Cache First"
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request);
    })
  );
});