const CACHE_NAME = 'zara-v3';
const PRECACHE_ASSETS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.svg', '.woff', '.woff2', '.ico'];

function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some(ext => url.pathname?.endsWith(ext));
}

// Install: pre-cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: claim clients and clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for API calls, stale-while-revalidate for pages
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Cache-first for static assets
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for everything else (HTML pages, etc.)
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

// Push notification handling
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'ZARA', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'zara-notification',
      data: data.url || '/',
    })
  );
});

// Notification click: focus or open window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(clients => {
    if (clients.length > 0) { clients[0].focus(); }
    else { clients.openWindow(event.notification.data || '/'); }
  }));
});
