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
   without this version moving, so the rule is enforced rather than remembered.

   UPDATE FLOW
   -----------
   When a new version is deployed, the new SW installs but does NOT call skipWaiting
   automatically. Instead it posts an 'SW_UPDATE_AVAILABLE' message to all open clients.
   The UpdateBanner component in the page hears this, shows a subtle banner, and only
   calls skipWaiting (via a 'SKIP_WAITING' postMessage) when the user clicks "Update Now".
   This gives users control rather than silently reloading pages mid-session.

   OFFLINE FALLBACK
   ----------------
   Navigation requests that miss both the network and the cache fall back to the root '/'
   which acts as the app shell. From there React renders an offline-aware view. */
const VERSION = 'mwangaza-v14';
const APP_SHELL = ['/', '/dashboard/', '/goals/', '/tbills/', '/ladder/', '/learn/', '/sources/', '/calculator/', '/auctions/', '/portfolio/', '/alerts/', '/prices/', '/receipts/', '/manifest.json', '/logo.svg', '/favicon.svg'];

self.addEventListener('install', (e) => {
  // Precache the app shell but do NOT call skipWaiting — we notify the page
  // instead and let the user decide when to apply the update.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients that an update has been applied.
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((clients) => {
            for (const client of clients) {
              client.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
            }
          });
      })
  );
});

// Message handler: pages can ask the SW to skip waiting (from the Update banner).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
        .catch(() => {
          // Offline: serve the cached route if available, otherwise the app shell.
          return caches.match(e.request).then((cached) => cached || caches.match('/'));
        })
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

   `notificationclick` is the whole of it. The app raises its own banners
   through this registration — Android refuses `new Notification()` from a page
   — and without this handler tapping one does nothing at all.

   THE `push` HANDLER WAS REMOVED, July 2026, along with the server that would
   have fed it. Web push requires a server to hold each device's endpoint, and
   an endpoint is an identifier for a specific person's device: it is personal
   data, and holding it is what makes us a data controller. The Registration
   Regulations 2021 disapply the small-operator exemption for Third Schedule
   purposes including "provision of financial services", so the cheapest way
   out of an arguable classification is to hold nothing at all.

   Nothing is lost that was working. The comment this replaces said so:
   "Nothing subscribes to push yet, so this never fires in production as
   shipped." The alert engine has always run on the device — see
   src/lib/alerts.ts — and the private rules (coupon due, maturity) were
   already device-only by design. The market rules now join them.
--------------------------------------------------------------------------- */
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

   `notificationclick` is the whole of it. The app raises its own banners
   through this registration — Android refuses `new Notification()` from a page
   — and without this handler tapping one does nothing at all.

   THE `push` HANDLER WAS REMOVED, July 2026, along with the server that would
   have fed it. Web push requires a server to hold each device's endpoint, and
   an endpoint is an identifier for a specific person's device: it is personal
   data, and holding it is what makes us a data controller. The Registration
   Regulations 2021 disapply the small-operator exemption for Third Schedule
   purposes including "provision of financial services", so the cheapest way
   out of an arguable classification is to hold nothing at all.

   Nothing is lost that was working. The comment this replaces said so:
   "Nothing subscribes to push yet, so this never fires in production as
   shipped." The alert engine has always run on the device — see
   src/lib/alerts.ts — and the private rules (coupon due, maturity) were
   already device-only by design. The market rules now join them.
--------------------------------------------------------------------------- */
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
