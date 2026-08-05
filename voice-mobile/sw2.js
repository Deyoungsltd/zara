const CACHE='zara-v4';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=e.request.url;if(u.includes('supabase.co')||u.includes('cdn.jsdelivr.net')||u.includes('openrouter.ai'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){caches.open(CACHE).then(c=>c.put(e.request,r.clone()))}return r}).catch(()=>caches.match(e.request)))});
