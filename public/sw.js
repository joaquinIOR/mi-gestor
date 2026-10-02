// Service worker: permite instalar la app y usarla sin conexión.
const CACHE = 'mi-gestor-v4';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest', './icons/icon-192.png']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navegación: red primero, con la app en caché como respaldo sin conexión.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  // Recursos propios (JS/CSS con hash, iconos): caché y actualización en segundo plano.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Al tocar una notificación se abre (o enfoca) la app. Los botones "− Gasto" / "+ Ingreso"
// de la notificación de acceso rápido abren directamente el formulario correspondiente.
self.addEventListener('notificationclick', (event) => {
  const quick = ['expense', 'income'].includes(event.action) ? event.action : null;
  // La notificación de acceso rápido se queda fija; las demás se cierran.
  if (!event.notification.data?.quickAccess) event.notification.close();
  const url = new URL(quick ? `./?quick=${quick}` : './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list[0];
      if (!client) return self.clients.openWindow(url);
      if (quick) client.postMessage({ type: 'quick', quick });
      return client.focus();
    })
  );
});

// Avisos con la app cerrada (Web Push). El contenido es siempre genérico.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'Mi Gestor').slice(0, 60), {
      body: String(data.body || 'Tienes novedades en Mi Gestor.').slice(0, 160),
      tag: String(data.tag || 'mi-gestor').slice(0, 40),
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
    })
  );
});
