/* Mwangaza Yield service worker: offline shell + data SWR + update controls. */
const VERSION = 'mwangaza-v15';
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = `${VERSION}-data`;
const IMAGE_CACHE = `${VERSION}-image`;
const QUEUE_CACHE = `${VERSION}-queue`;

const APP_SHELL = [
  '/', '/dashboard/', '/calculator/', '/portfolio/', '/goals/', '/ladder/', '/prices/',
  '/auctions/', '/tbills/', '/learn/', '/macro/', '/offline/', '/manifest.json',
  '/logo.svg', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => ![STATIC_CACHE, DATA_CACHE, IMAGE_CACHE, QUEUE_CACHE].includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'QUEUE_EVENT' && event.data?.payload) {
    event.waitUntil(queueEvent(event.data.payload));
  }
});

async function queueEvent(payload) {
  const cache = await caches.open(QUEUE_CACHE);
  const key = new Request(`/__queue__/${Date.now()}-${Math.random()}`);
  await cache.put(key, new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }));
}

async function flushQueue() {
  const cache = await caches.open(QUEUE_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.map(async (req) => {
    try {
      const res = await cache.match(req);
      const body = res ? await res.json() : null;
      if (!body) return;
      await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      await cache.delete(req);
    } catch {
      // Keep queued for later.
    }
  }));
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'analytics-sync' || event.tag === 'community-price-sync') {
    event.waitUntil(flushQueue());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'macro-refresh') {
    event.waitUntil((async () => {
      const targets = ['/data/macro.json', '/data/bonds.json', '/data/auctions.json', '/data/tbills.json'];
      const cache = await caches.open(DATA_CACHE);
      await Promise.all(targets.map(async (u) => {
        try {
          const res = await fetch(`${u}?psync=${Date.now()}`, { cache: 'no-store' });
          if (res.ok) await cache.put(u, res.clone());
        } catch {
          // Ignore while offline.
        }
      }));
    })());
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request.url);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request.url, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }
  return (await networkPromise) || new Response('[]', { headers: { 'content-type': 'application/json' } });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline and not cached' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/data/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/og') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('/offline/')) || (await caches.match('/'));
      }
    })());
    return;
  }

  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/alerts/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(href).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
