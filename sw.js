/**
 * AERO FLOW AIRLINES — Service Worker (PWA Shell Engine)
 * Versión de Caché: aeroflow-pwa-v1.0.0
 * Estrategias: Network-First (HTML/Docs), Cache-First (Assets Estáticos)
 * Regla de Oro: NUNCA interceptar ni cachear Supabase API/Auth
 */

const CACHE_NAME = 'aeroflow-pwa-v1.0.0';

const STATIC_APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/static/css/tactical.css?v=35.0',
  '/static/css/login.css?v=1.0',
  '/static/js/core.js?v=35.0',
  '/static/js/app.js?v=35.0',
  '/static/js/auth.js?v=1.0',
  '/js/config.js',
  '/vendor/supabase.js',
  '/assets/fonts/fonts.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png'
];

// Instalación: Cachear App Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usar allSettled para evitar que un asset puntual rompa la instalación
      return Promise.allSettled(
        STATIC_APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] No se pudo pre-cachear: ${url}`, err.message);
          })
        )
      );
    })
  );
});

// Activación: Limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purgando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Interceptor
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. REGLA ESTRICTA DE SEGURIDAD: NUNCA cachear Supabase, Auth, WebSockets o métodos no-GET
  if (
    req.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/') ||
    url.protocol.startsWith('ws')
  ) {
    return; // Dejar pasar a la red sin interceptar
  }

  // 2. Navegación HTML: Network-First con fallback a cache o offline.html
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          const cachedRes = await caches.match(req);
          if (cachedRes) return cachedRes;
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // 3. Recursos Estáticos (CSS, JS, Fonts, Icons, Img): Cache-First / Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        // En segundo plano revalidar en la red (Stale-While-Revalidate)
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
          }
        }).catch(() => {});
        return cachedRes;
      }

      return fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200 && req.url.startsWith(self.location.origin)) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // Si es una imagen y falla, podemos retornar fallback transparente
          if (req.headers.get('accept')?.includes('image/')) {
            return caches.match('/icons/favicon-32.png');
          }
        });
    })
  );
});

