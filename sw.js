/**
 * AERO FLOW AIRLINES — Service Worker (v1.0.0)
 * PWA: cachea solo el app shell. HTML en network-first.
 * NUNCA cachea supabase.co ni autenticación.
 */

const CACHE_NAME = 'aeroflow-shell-v1';
const OFFLINE_URL = '/offline.html';

// App shell: archivos estáticos que se cachean de antemano
const APP_SHELL = [
  '/',
  '/index.html',
  '/static/css/tactical.css?v=35.0',
  '/static/css/login.css?v=1.0',
  '/static/js/core.js?v=35.0',
  '/static/js/app.js?v=35.0',
  '/static/js/auth.js?v=35.0',
  '/js/config.js',
  '/vendor/supabase.js',
  '/static/img/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  OFFLINE_URL
];

// Rutas que NUNCA se deben cachear (autenticación y Supabase)
const NO_CACHE_PATTERNS = [
  'supabase.co',
  '/auth',
  '/api/auth',
  '/login'
];

function debeIgnorarCache(url) {
  return NO_CACHE_PATTERNS.some(p => url.includes(p));
}

// ============================================================
// INSTALAR: cachear app shell
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVAR: limpiar caches antiguos
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH: estrategia por tipo de recurso
// ============================================================
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. Nunca cachear Supabase ni autenticación → siempre red
  if (debeIgnorarCache(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. HTML (todas las páginas incluidas index.html) → network-first
  if (event.request.mode === 'navigate' || event.request.dest === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clonar y cachear la respuesta de HTML si es exitosa
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Si falla la red, servir offline.html o cache
          return caches.match(OFFLINE_URL).then((cached) => cached || caches.match(event.request));
        })
    );
    return;
  }

  // 3. Recursos estáticos del app shell (CSS, JS, imágenes, íconos) → cache-first
  if (APP_SHELL.includes(event.request.url) || url.includes('/static/') || url.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => {
          if (cached) return cached;
          return fetch(event.request)
            .then((response) => {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
              return response;
            });
        })
    );
    return;
  }

  // 4. Cualquier otro recurso → network-first
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
