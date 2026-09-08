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
export default function DataState({
  label = 'bonds',
  /* How much room to hold while loading, as a Tailwind height class.
   *
   * The default `h-64` is 256px and was the same on every page, which is where
   * four routes lost their CLS budget. Each of these pages is a ToolShell: an
   * interactive tool, then a server-rendered prose block below it. The tool
   * renders 256px of skeleton and then expands — measured at 390px, 936px on
   * /sell/, 1,814 on /goals/, 2,152 on /calculator/ and 10,299 on /prices/ —
   * and the prose, sitting at y≈405 and plainly in view, is thrown down the
   * page. /goals/ measured 0.2752 against a 0.1 budget, /prices/ 0.2519,
   * /calculator/ 0.2502, /sell/ 0.2225.
   *
   * `tall` is NOT an attempt to match the final height. Those range from 936
   * to 10,299px and depend on the reader's own saved data, so no constant can
   * be right. It holds a little over one viewport, which is all that is
   * needed: what follows the tool then starts below the fold, and its arrival
   * moves nothing the reader can see. */
  reserve = 'h-64',
}: {
  label?: string;
  reserve?: string;
}) {
  const loaded = useBondStore((s) => s.loaded);
  const offline = useBondStore((s) => s.offline);
  const fetchData = useBondStore((s) => s.fetchData);

  // Genuinely still loading: a skeleton is honest here.
  if (!loaded && !offline) {
    return <div className={`card ${reserve} animate-pulse`} aria-busy="true" aria-label={`Loading ${label}`} />;
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
