'use client';

/**
 * What auctions in the last twelve months actually paid, and how hungry the
 * demand was. The honest complement to the yield-curve card above it, whose
 * points can be years stale (its own comment says so): everything here is
 * recent by construction, bucketed on remaining term rather than the tenor
 * label, and a band where the government simply hasn't sold paper lately says
 * "no recent sales" instead of quoting an old number.
 */

import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { refreshCadence } from '@/lib/data-freshness';
import {
  demandPulse,
  recentClearingByTerm,
  MIN_BUCKET_SAMPLE,
  PULSE_WINDOW_DAYS,
} from '@/lib/market-pulse';
import Term from '@/components/shared/Term';
import Explain from '@/components/shared/Explain';
import Reserve from '@/components/shared/Reserve';

export default function MarketPulse() {
  const auctionResults = useBondStore((s) => s.auctionResults);
  const bonds = useBondStore((s) => s.bonds);

  const { buckets, demand } = useMemo(() => {
    const asOf = new Date();
    return {
      buckets: recentClearingByTerm(auctionResults, bonds, asOf),
      demand: demandPulse(auctionResults, asOf),
    };
  }, [auctionResults, bonds]);

  if (!buckets.some((b) => b.median !== null)) return <Reserve height={220} />;

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">
          What the last 12 months of auctions actually paid
        </h2>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Clearing rates from CBK auction results, grouped by how long the paper
        actually had left to run when it was sold.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-faint">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Time left to run</th>
              <th className="py-1.5 pr-3 font-medium">Cleared at (median)</th>
              <th className="py-1.5 pr-3 font-medium">Range</th>
              <th className="py-1.5 font-medium">Auctions</th>
            </tr>
          </thead>
          <tbody className="text-ink-soft">
            {buckets.map((b) => (
              <tr key={b.label} className="border-t border-sand-200">
                <td className="py-2 pr-3 font-medium text-ink">{b.label}</td>
                {b.median === null ? (
                  <td colSpan={3} className="py-2 text-ink-faint">
                    {b.count === 0
                      ? 'no sales in the last year'
                      : `only ${b.count} auction${b.count === 1 ? '' : 's'} — too few to quote`}
                  </td>
                ) : (
                  <>
                    <td className="num py-2 pr-3 font-semibold text-gold-700">
                      {b.median.toFixed(2)}%
                    </td>
                    <td className="num py-2 pr-3">
                      {b.low!.toFixed(2)}–{b.high!.toFixed(2)}%
                    </td>
                    <td className="num py-2">{b.count}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {demand && (
        <p className="mt-3 border-t border-sand-200 pt-3 text-sm text-ink-soft">
          Across {demand.auctions} auctions in the window, bids covered{' '}
          <span className="num font-semibold text-ink">{demand.medianCover.toFixed(2)}x</span>{' '}
          the amount offered and CBK accepted{' '}
          <span className="num font-semibold text-ink">
            {(demand.medianAcceptance * 100).toFixed(0)}%
          </span>{' '}
          of the money bid, at the median
          {demand.coverTrendPp !== null && (
            <>
              {' '}— demand{' '}
              {Math.abs(demand.coverTrendPp) < 0.1
                ? 'roughly steady'
                : demand.coverTrendPp > 0
                  ? 'strengthening'
                  : 'fading'}{' '}
              against the earlier half of the year
            </>
          )}
          .
        </p>
      )}

      <Explain>
        <p>
          {/* PULSE_WINDOW_DAYS, not "365". MIN_BUCKET_SAMPLE two sentences down
            * was already imported; the window was the one number in this
            * paragraph still typed by hand, so narrowing the window in
            * market-pulse.ts would have left this telling readers it covers a
            * year of auctions when it no longer did. */}
          Each row takes every CBK auction result from the last {PULSE_WINDOW_DAYS} days, works out how many years
          the bond had left to run <em>on the auction day</em> — not the tenor printed in its issue
          code, which stays fixed for life even when a &ldquo;15-year&rdquo; bond is re-opened with
          five years left — and reports the median <Term slug="clearing-rate">clearing rate</Term>{' '}
          per band. Demand is bids received divided by the amount offered,{' '}
          <em>grouped per auction</em>: one auction often covers several bonds, and dividing per
          bond understates cover badly. A band with fewer than {MIN_BUCKET_SAMPLE} auctions shows no
          figure — a median of two numbers is an anecdote. Source: CBK auction result publications;
          {/* Derived, not written down. This sentence used to name a single
              daily time, which stopped being true when the schedule moved to
              twice a day, Monday to Saturday — the same drift refreshCadence()
              exists to end, and the same one that left the README describing
              the wrong cron for hours after it changed. The exact stale
              wording is not repeated here: schedule-matches-workflow.test.ts
              greps for it, and a comment quoting it would trip that guard. */}
          {' '}the archive is rebuilt {refreshCadence()}.
        </p>
      </Explain>
    </div>
  );
}
