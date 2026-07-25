'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';

/**
 * What to show when there is nothing to show yet.
 *
 * Every page used to render an `animate-pulse` skeleton whenever bonds were
 * empty — including when the fetch had already failed. A grey box that pulses
 * forever is worse than an error: it looks like the app is hanging, gives no
 * reason, and offers nothing to do next. On a patchy Kenyan mobile connection
 * that is a likely first impression, not an edge case.
 *
 * So we distinguish the three real situations and say which one it is.
 */
export default function DataState({ label = 'bonds' }: { label?: string }) {
  const loaded = useBondStore((s) => s.loaded);
  const offline = useBondStore((s) => s.offline);
  const fetchData = useBondStore((s) => s.fetchData);

  // Genuinely still loading: a skeleton is honest here.
  if (!loaded && !offline) {
    return <div className="card h-64 animate-pulse" aria-busy="true" aria-label={`Loading ${label}`} />;
  }

  return (
    <div className="card flex flex-col items-start gap-3">
      <CloudOff size={22} className="text-ink-faint" />
      <div>
        <p className="font-display font-semibold text-ink">
          {offline ? `We could not reach the ${label} data` : `No ${label} to show yet`}
        </p>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
          {offline
            ? 'You appear to be offline and this device has no saved copy yet. Once it loads the first time, it works without a network — so try again when you have a signal.'
            : 'This is unusual. The figures are published as files alongside the app, so if this persists it is our problem rather than yours.'}
        </p>
      </div>
      <button
        onClick={() => fetchData()}
        className="inline-flex items-center gap-2 rounded-xl border border-sand-400 bg-sand-50 px-4 py-2 font-display text-sm font-semibold text-ink transition hover:border-gold-500"
      >
        <RefreshCw size={14} /> Try again
      </button>
      <p className="text-[11px] text-ink-faint">
        Still stuck? <a href="/support/" className="text-gold-700 hover:underline">Tell us</a> — a
        blank screen is worth reporting.
      </p>
    </div>
  );
}
