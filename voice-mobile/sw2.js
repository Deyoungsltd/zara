const CACHE = 'zara-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', (e) => {
  // Delete ALL old caches
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // API calls always go to network
  if (url.includes('supabase.co') || url.includes('cdn.jsdelivr.net') || url.includes('openrouter.ai')) {
    return;
  }
  // NETWORK FIRST for everything — always get latest
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
