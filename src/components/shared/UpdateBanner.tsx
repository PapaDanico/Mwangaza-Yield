'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * "New version available" banner.
 *
 * When the service worker detects a waiting installation it posts
 * SW_ACTIVATED to all open clients. This component listens for a *waiting*
 * registration, shows a one-line banner, and offers "Update Now" (which posts
 * SKIP_WAITING to the SW) or "Later" (which dismisses for this session).
 *
 * It does NOT use the old `skipWaiting()` auto-advance from the install
 * handler — that would reload the page mid-session without asking. The sw.js
 * install handler was changed in v14 to leave the new SW waiting and let the
 * user decide.
 */
export default function UpdateBanner() {
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let wb: ServiceWorkerRegistration | null = null;

    function checkWaiting(reg: ServiceWorkerRegistration) {
      if (reg.waiting) setWaiting(true);
    }

    navigator.serviceWorker.ready.then((reg) => {
      wb = reg;
      checkWaiting(reg);

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && reg.active) {
            setWaiting(true);
          }
        });
      });
    });

    // Also listen for the SW_ACTIVATED message the new SW sends on activate.
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'SW_ACTIVATED') {
        // A new version already took over — reload to pick it up.
        window.location.reload();
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  function updateNow() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Reload once the new SW takes over.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.location.reload();
        }, { once: true });
      }
    });
  }

  if (!waiting || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-sand-300 bg-sand-50 px-4 py-2.5 shadow-lg md:bottom-4"
    >
      <RefreshCw size={14} className="shrink-0 text-gold-600" />
      <p className="text-sm text-ink">New version available.</p>
      <button
        onClick={updateNow}
        className="min-h-[36px] rounded-lg bg-ink px-3 py-1 text-xs font-semibold text-sand-50 hover:bg-ink-soft"
      >
        Refresh to update
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-sand-200"
      >
        <X size={13} />
      </button>
    </div>
  );
}
