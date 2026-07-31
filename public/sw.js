/* Mwangaza Yield service worker — offline-first app shell + stale-while-revalidate data.

   Bump VERSION whenever this file changes OR whenever the CONTENT of anything in
   APP_SHELL changes. Activation drops the old cache, and that is the only mechanism
   reclaiming stale assets from previous deploys.

   The second half of that rule used to be missing, and it cost a whole release. The
   comment read "bump VERSION whenever this file changes", so when logo.svg and
   favicon.svg were replaced with a new brand mark, sw.js itself was untouched and the
   version stayed at v11. The new mark deployed correctly and no returning visitor ever
   saw it: their service worker kept answering /logo.svg from the v11 cache. A first-time
   visitor saw the new brand, everyone who already had the app saw the old one, and
   nothing anywhere reported a problem — it was found only because a human looked at the
   site and said the logo had not changed.

   tests/unit/sw-shell-version.test.ts now fails when a precached asset's bytes change
   without this version moving, so the rule is enforced rather than remembered. */
const VERSION = 'mwangaza-v12';
const APP_SHELL = ['/', '/dashboard/', '/goals/', '/tbills/', '/ladder/', '/learn/', '/sources/', '/calculator/', '/auctions/', '/portfolio/', '/alerts/', '/manifest.json', '/logo.svg', '/favicon.svg'];

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

  /* Downloads are not part of the offline promise.
   *
   * The catch-all below is cache-first, so anything fetched once lives in the
   * cache until the next VERSION bump. That is right for hashed chunks and
   * wrong for a document somebody downloads once and opens in PowerPoint: the
   * offline guarantee this app makes is about the tools working on a matatu,
   * not about a partnership deck being available without signal.
   *
   * Small today — the deck is 132 KB — but the rule should not depend on that,
   * because the next thing put in /partners/ might not be. */
  if (url.pathname.startsWith('/partners/')) return;

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
  //
  // The failure path used to answer with `caches.match('/')` — the app-shell
  // HTML — for ANY asset that could not be fetched. For an image that is
  // merely silly. For a JavaScript chunk it is the cause of a bug that took a
  // long time to find: the browser receives HTTP 200 with an HTML body, treats
  // the chunk as loaded, and no module factory ever registers. The next
  // __webpack_require__ then does `modules[id].call(...)` on undefined and the
  // reader sees
  //
  //     Could not build the PDF (Cannot read properties of undefined (reading 'call'))
  //
  // which is what "the PDF button is still broken" looked like on a phone with
  // one flaky moment on mobile data. jspdf and html2canvas-pro are dynamic
  // imports, so they are fetched at the instant the button is pressed — the
  // worst possible time to substitute a document for a script.
  //
  // A failed asset must FAIL. The error is then the real one, the retry works,
  // and nothing is poisoned for the rest of the session.
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
        })
    )
  );
});

/* ---------------------------------------------------------------------------
   Notifications.

   `notificationclick` matters today: the app raises banners itself through this
   registration (Android refuses `new Notification()` from a page), and without
   this handler tapping one does nothing at all.

   `push` is here for the day a sender exists. It is deliberately defensive —
   an empty or non-JSON payload still produces a banner rather than an
   unhandled rejection in the service worker, which some browsers punish by
   showing their own "site updated in the background" notice. Nothing subscribes
   to push yet, so this never fires in production as shipped.
--------------------------------------------------------------------------- */
self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (_) { payload = {}; }
  const title = payload.title || 'Mwangaza Yield';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'Open the app for details.',
      tag: payload.tag || 'mwangaza-push',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { href: payload.href || '/alerts/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || '/alerts/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Reuse an open tab where we can; a second copy of the app is a worse
      // answer than the one the reader already has.
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(href).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    })
  );
});
