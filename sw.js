/**
 * Service Worker para PulseVision PWA
 * Cachea archivos esenciales para funcionamiento offline
 */

const CACHE_NAME = 'pulsevision-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './assets/images/colibri-logo.png',
  './src/components/bottom-nav.js',
  './src/components/colibri-guide.js',
  './src/components/icons.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600&display=swap',
  'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2',
  'https://fonts.gstatic.com/s/poppins/v20/pxiEyp8kv8JHgFVrJJfecnFHGPc.woff2'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.log('Service Worker: Error al cachear archivos', error);
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Eliminando cache antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estrategia: Network First, luego Cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Excluir requests a APIs externas y recursos que no necesitamos cachear
  if (url.hostname.includes('nominatim.openstreetmap.org') ||
      url.hostname.includes('api.') ||
      url.hostname.includes('api') && !url.origin.includes(location.origin)) {
    return; // No interceptar estos requests
  }

  // Solo interceptar requests GET
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Verificar que la respuesta sea válida
        if (!response || response.status !== 200) {
          return response;
        }
        
        // Clonar la respuesta
        const responseToCache = response.clone();
        
        // Agregar al cache si es una respuesta válida
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          })
          .catch((error) => {
            console.log('Service Worker: Error al cachear', error);
          });
        
        return response;
      })
      .catch(() => {
        // Si falla la red, buscar en cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // Si no está en cache y es navegación, devolver index.html
            if (event.request.mode === 'navigate' || 
                (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
              return caches.match('./index.html');
            }
          });
      })
  );
});

