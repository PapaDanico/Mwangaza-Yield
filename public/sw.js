/* Mwangaza Yield service worker — offline-first app shell + stale-while-revalidate data.
   Bump VERSION whenever this file changes: activation drops the old cache, which is the
   only mechanism reclaiming stale hashed assets from previous deploys. */
const VERSION = 'mwangaza-v6';
const APP_SHELL = ['/', '/dashboard/', '/goals/', '/tbills/', '/ladder/', '/learn/', '/sources/', '/calculator/', '/auctions/', '/portfolio/', '/manifest.json', '/logo.svg', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Data files: network-first with cache fallback, so figures stay fresh.
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Navigations: network-first so deploys reach users; cache is the offline fallback.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Hashed assets and icons: cache-first (immutable per deploy).
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        }).catch(() => caches.match('/'))
    )
  );
});
