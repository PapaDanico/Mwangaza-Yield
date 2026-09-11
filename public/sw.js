/* Mwangaza Yield service worker: offline shell + data SWR + update controls. */
const VERSION = 'mwangaza-v30';
const STATIC_CACHE = `${VERSION}-static`;
const DATA_CACHE = `${VERSION}-data`;
const IMAGE_CACHE = `${VERSION}-image`;

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
    await Promise.all(keys.filter((k) => ![STATIC_CACHE, DATA_CACHE, IMAGE_CACHE].includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/* The background-sync queue that stood here has been removed.
 *
 * It cached QUEUE_EVENT messages and flushed them to POST /api/events on a
 * 'analytics-sync' or 'community-price-sync' background sync. Nothing in the
 * app has ever sent a QUEUE_EVENT or registered either sync tag — grep the
 * source — and there is no /api/events to receive one: the only function in
 * netlify/functions is track.mts. So the queue could only ever have been
 * filled by a caller that does not exist, and drained into a 404.
 *
 * It was not free while it sat there. QUEUE_CACHE was a fourth versioned
 * cache opened on every activate, and `flushQueue` was live code holding an
 * endpoint contract that no longer matched the deployment. */

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
  const url = new URL(request.url);

  /* Key on the PATH, not the whole URL.
   *
   * The Data Health panel's refresh button fetches `/data/<file>?ts=<now>`
   * (DataStatus.tsx), and a URL-keyed cache stored every one of those under
   * its own unique key. Nothing ever read them again — the next refresh
   * carried a new timestamp — and nothing evicted them, because the only
   * eviction here fires when VERSION moves. Nineteen datasets times every
   * refresh anyone ever pressed, growing without bound on the device.
   *
   * Keying on the path makes a refresh REPLACE the canonical entry, which is
   * what a refresh means, and bounds the cache at one entry per dataset. The
   * query string still has to bypass the cache READ, or a deliberate bust
   * would be answered from the copy it was pressed to get past. */
  const key = url.pathname;
  const cached = url.search ? undefined : await cache.match(key);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(key, response.clone());
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
