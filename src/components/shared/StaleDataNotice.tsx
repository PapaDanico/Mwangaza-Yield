'use client';

/**
 * Tells the reader when the figures have stopped being refreshed.
 *
 * WHY IT IS A BANNER AND NOT A BADGE
 * ----------------------------------
 * `OfflineBadge` sits in the navbar because "you are offline" is a fact about
 * the reader's connection that they can usually see for themselves. "These
 * rates stopped updating a week ago" is a fact about the numbers they are
 * about to act on, and there is nothing else on screen to hint at it — every
 * page renders confident, well-formatted figures whether they were refreshed
 * this morning or last month.
 *
 * WHY IT STILL RE-CHECKS ON THE CLIENT
 * ------------------------------------
 * The site is statically exported, so a server-rendered "now" is frozen at
 * build time. That makes the build clock useless for deciding the banner is
 * unnecessary — the data ages after the build, and the effect is what turns
 * this into a live check rather than a build-time constant.
 *
 * WHY THE BUILD CLOCK IS NEVERTHELESS USED FOR THE FIRST PAINT
 * -----------------------------------------------------------
 * Staleness only ever increases. The build cannot know a banner will NOT be
 * needed, but it can know one WILL be: if the shipped data was already past
 * the threshold when the page was built, no amount of elapsed time makes it
 * fresh again.
 *
 * That asymmetry was being thrown away, and it cost real quality. Rendering
 * null and then appearing on mount pushed <main> down 99px on every route —
 * measured at 390px, a single 0.0994 layout shift, which by itself was most
 * of the CLS budget and put four routes over Google's 0.10 threshold:
 *
 *     /            0.1035        /ladder/      0.1160
 *     /dashboard/  0.1217        /portfolio/   0.0994
 *
 * A banner warning that figures moved, which itself moves the figures out
 * from under the reader as they start reading, is a poor way to make that
 * point. So layout.tsx computes the notice at build time and passes it as
 * `initialNotice`: when it is non-null the banner is in the served HTML and
 * nothing shifts, and the effect then keeps the wording current as further
 * scheduled runs are missed.
 *
 * Passing it as a prop rather than recomputing at module scope is deliberate —
 * a module-level `new Date()` evaluates at build on the server and at load in
 * the browser, which is exactly the hydration mismatch this component's
 * original design was avoiding. A serialized prop is the same value on both
 * sides by construction.
 *
 * It renders null in the ordinary case, including every weekend. See
 * data-freshness.ts for why the threshold counts missed scheduled runs rather
 * than days elapsed.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { readerNotice } from '@/lib/data-freshness';

export default function StaleDataNotice({
  /** The notice as computed at build time, or null if there was none to make. */
  initialNotice = null,
}: {
  initialNotice?: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(initialNotice);

  useEffect(() => {
    // What is actually out of date, judged against each publisher's own
    // cadence. NOT whether the refresh job ran: that is an operations fact,
    // it lives in the Data Health panel, and showing it here told readers to
    // distrust figures that were correct. See readerNotice.
    setNotice(readerNotice(new Date()));
  }, []);

  if (!notice) return null;

  return (
    <div
      role="status"
      className="border-b border-gold-600/40 bg-gold-500/10 px-4 py-2.5"
    >
      <p className="mx-auto flex max-w-4xl items-start gap-2 text-xs leading-relaxed text-gold-800">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{notice}</span>
      </p>
    </div>
  );
}
