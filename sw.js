/**
 * AERO FLOW AIRLINES — Service Worker Purge & Auto-Unregister
 * Limpieza obligatoria de versiones antiguas y cachés obsoletos.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    }).then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
