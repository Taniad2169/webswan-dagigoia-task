// Offline shell for the travel agency app: the page and its icons work offline; live data needs a connection.
const C = 'travel-agency-v1';
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(['./', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'])).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
