// Service worker: permite instalar la app y usarla sin conexión.
// Se genera al compilar (vite.config.js): VERSION cambia con cada publicación y PRECACHE trae la lista
// exacta de archivos de esa versión, así la app completa queda guardada en el teléfono desde la primera visita.
const VERSION = '772d341965b0';
const PRECACHE = ["./","manifest.webmanifest","icons/apple-touch-icon.png","icons/badge-96.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","icons/shortcut-expense-96.png","icons/shortcut-income-96.png","assets/index-CC-4U8BI.css","assets/index-C8Diw0_O.js"];
const CACHE = `mi-gestor-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// La versión nueva toma el control y borra las anteriores (que ya no se usan).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mi-gestor-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Navegación: la app guardada de esta versión. Abre al instante, con o sin señal; las versiones
  // nuevas llegan instalando un service worker nuevo (la app avisa para recargar).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match('./')) || fetch(request))
    );
    return;
  }
  // Archivos de la app: de la caché de esta versión; lo demás, de la red.
  event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request)) || fetch(request)));
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
      // Solo ventanas de esta app (el dominio puede tener otras páginas), y de preferencia la que está al frente.
      const mine = list.filter((c) => c.url.startsWith(self.registration.scope));
      const client = mine.find((c) => c.focused) || mine[0];
      if (!client) return self.clients.openWindow(url);
      if (quick) client.postMessage({ type: 'quick', quick });
      return client.focus();
    })
  );
});

// Avisos con la app cerrada (Web Push). Los textos son fijos y genéricos: aunque alguien
// lograra enviar un aviso, no puede hacerlo pasar por Mi Gestor con un texto propio.
const PUSH_TEXTS = {
  'mi-gestor-grupo': 'Hay novedades en un grupo compartido.',
  'mi-gestor-recordatorio': 'Tienes un pago o una cuenta por vencer. Abre Mi Gestor para ver el detalle.',
};
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const tag = Object.hasOwn(PUSH_TEXTS, data.tag) ? data.tag : 'mi-gestor';
  event.waitUntil(
    self.registration.showNotification('Mi Gestor', {
      body: PUSH_TEXTS[tag] || 'Tienes novedades en Mi Gestor.',
      tag,
      renotify: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
    })
  );
});
