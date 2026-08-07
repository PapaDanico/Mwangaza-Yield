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
 * WHY IT RENDERS ON THE CLIENT AFTER MOUNT
 * ----------------------------------------
 * The site is statically exported, so a server-rendered "now" would be frozen
 * at build time — the moment the data was fresh, which is exactly the moment
 * this component has nothing to say. Computing the comparison in an effect is
 * what makes it a live check rather than a build-time constant, and avoids a
 * hydration mismatch between two different clocks.
 *
 * It renders null in the ordinary case, including every weekend. See
 * data-freshness.ts for why the threshold counts missed scheduled runs rather
 * than days elapsed.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { freshness, freshnessNotice, staleDatasetNotice } from '@/lib/data-freshness';

export default function StaleDataNotice() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Two independent questions, and the pipeline one comes first because it
    // subsumes the other: if the refresh has stopped entirely, naming
    // individual datasets is noise on top of the real fault.
    setNotice(freshnessNotice(freshness(new Date())) ?? staleDatasetNotice());
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
