const CACHE_PREFIX = "fia-cache-";
const CACHE_NAME = "fia-cache-v6";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@500;600;700&display=swap",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
  "https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11.15.10/dist/sweetalert2.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(urlsToCache.map(async url => {
      const request = new Request(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin' });
      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
          await cache.put(request, response);
        }
      } catch (error) {
        console.warn('[ServiceWorker] No se pudo precargar:', url);
      }
    })))
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
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }

  const cdnHosts = new Set([
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.socket.io'
  ]);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin && !cdnHosts.has(url.hostname)) return;

  const isAsset = ['document', 'script', 'style', 'image', 'font', 'worker'].includes(event.request.destination)
    || /\.(css|mjs|js|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico)$/i.test(url.pathname)
    || url.pathname === '/manifest.json';
  if (!isAsset) return;

  const cachePromise = caches.open(CACHE_NAME);
  const networkPromise = cachePromise.then(cache => fetch(event.request).then(async response => {
      if ((response.ok || response.type === 'opaque') && response.status !== 206) {
        await cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
  }));
  event.waitUntil(networkPromise.then(() => {}).catch(() => {}));

  event.respondWith(cachePromise.then(async cache => {
    const cachedResponse = await cache.match(event.request, { ignoreVary: true });
    if (cachedResponse) return cachedResponse;

    try {
      return await networkPromise;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        return await cache.match('/index.html', { ignoreVary: true }) || Response.error();
      }
      return Response.error();
    }
  }));
});