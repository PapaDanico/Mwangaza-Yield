'use client';

import { useBondStore } from '@/stores/bondStore';

/**
 * Hold a card's space open while its data is still arriving.
 *
 * Every data-driven card on the dashboard returns `null` until the store
 * hydrates, so the page assembles by having each card POP IN and shove
 * everything below it down the screen. Measured on the shipped build at 390px:
 *
 *     dashboard   CLS 0.4348
 *     auctions    CLS 0.7713
 *     ladder      CLS 0.1918
 *
 * Google calls anything above 0.10 poor. Auctions was displacing roughly
 * three-quarters of a viewport — a reader who starts reading, or reaches for a
 * link, gets the page yanked out from under them. Nothing about that reads as
 * a considered product, and no amount of typography compensates for it.
 *
 * So a card that will exist reserves its height beforehand. The reservation is
 * deliberately quiet — a faint pulse, no fake bars pretending to be content —
 * because the honest statement is "something is coming here", not a mimicry of
 * numbers that have not been computed.
 *
 * WHY IT IS GATED ON `loaded` RATHER THAN ON EMPTINESS
 * ----------------------------------------------------
 * A card that is empty AFTER loading is a different fact: that bond has no
 * history, or that band has too few auctions to speak. Those must stay
 * invisible, not become a permanent grey rectangle. DataState makes exactly
 * this distinction for the fetch-failed case and this follows it: reserve only
 * while genuinely still waiting.
 */
export default function Reserve({
  /** Roughly what the real card occupies, so the swap does not shift either way. */
  height,
  className = '',
}: {
  height: number;
  className?: string;
}) {
  const loaded = useBondStore((s) => s.loaded);
  const offline = useBondStore((s) => s.offline);

  // Loaded, or failed and said so elsewhere: this component has no opinion.
  if (loaded || offline) return null;

  return (
    <div
      className={`card animate-pulse ${className}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
