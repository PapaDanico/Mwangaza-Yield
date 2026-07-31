'use client';

/**
 * The bid assistant's public track record.
 *
 * Every range in this list was recorded BEFORE its auction closed — the
 * recorded-on date is part of the entry — and scored against the clearing
 * rate CBK published afterwards. The ledger is append-only (enforced by
 * scripts/update-predictions.mjs and pinned by tests), which is the entire
 * point: a forecast that can be edited after the fact is marketing, and this
 * page is meant to be checkable instead.
 */

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { summariseLedger, type Prediction } from '@/lib/predictions';
import { backtest, summariseBacktest } from '@/lib/backtest';
import { useBondStore } from '@/stores/bondStore';
import { cn } from '@/lib/utils';

export default function TrackRecord() {
  const [ledger, setLedger] = useState<Prediction[] | null>(null);
  const bonds = useBondStore((s) => s.bonds);
  const auctionResults = useBondStore((s) => s.auctionResults);

  /* Replayed in the browser from data the store already holds, so this costs
   * no extra fetch. Memoised because it is a few hundred guidance rebuilds and
   * the inputs only change when the archive reloads. */
  const bt = useMemo(
    () =>
      auctionResults.length && bonds.length
        ? summariseBacktest(backtest(auctionResults, bonds))
        : null,
    [auctionResults, bonds]
  );

  useEffect(() => {
    fetch('/data/predictions.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setLedger)
      .catch(() => setLedger([]));
  }, []);

  // Fetched separately from the store, so this is the last thing on the page
  // to arrive and it sat below two other cards. Reserving is unconditional
  // here: this component owns its own loading state rather than the store's.
  if (!ledger) return <div className="card h-40 animate-pulse" aria-hidden="true" />;
  const s = summariseLedger(ledger);
  const rows = [...ledger].sort((a, b) => b.auctionDate.localeCompare(a.auctionDate)).slice(0, 12);

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">Bid guidance track record</h2>
      </div>

      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Nothing to show yet — and that is deliberate. When CBK announces the next auction, the
          guidance range is recorded here <em>before</em> bidding closes, then scored against the
          published result. A forecast only counts if it was written down first.
        </p>
      ) : (
        <>
          {s.claims > 0 && (
            <p className="mt-1.5 text-sm text-ink-soft">
              Of <span className="num font-semibold">{s.claims}</span> scored prediction{s.claims === 1 ? '' : 's'},
              the stated range contained the actual clearing rate{' '}
              <span className="num font-semibold">{s.hitRange}</span> time{s.hitRange === 1 ? '' : 's'}
              {' '}(middle half: <span className="num">{s.hitMiddleHalf}</span>).
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1 pr-3 font-medium">Bond</th>
                  <th className="py-1 pr-3 font-medium">Auction</th>
                  <th className="py-1 pr-3 font-medium">Recorded</th>
                  <th className="py-1 pr-3 font-medium">Stated range</th>
                  <th className="py-1 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="text-ink-soft">
                {rows.map((r) => (
                  <tr key={`${r.issueCode}|${r.auctionDate}`} className="border-t border-sand-200">
                    <td className="py-1.5 pr-3 font-medium text-ink">{r.issueCode}</td>
                    <td className="num py-1.5 pr-3">{r.auctionDate}</td>
                    <td className="num py-1.5 pr-3">{r.recordedOn}</td>
                    <td className="num py-1.5 pr-3">
                      {r.low.toFixed(2)}–{r.high.toFixed(2)}%{r.thin && (
                        <span className="ml-1 text-ink-faint">(thin sample)</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {r.scoredOn === undefined ? (
                        <span className="text-ink-faint">awaiting result</span>
                      ) : (
                        <span
                          className={cn(
                            'num font-semibold',
                            r.hitRange ? 'text-mint-700' : 'text-red-600'
                          )}
                        >
                          {r.actualRate!.toFixed(2)}% {r.hitRange ? '✓ in range' : '✗ outside'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* THE BACKTEST, AND WHY IT SITS BELOW THE LIVE LEDGER
        *
        * The ledger above is the real record: ranges written down before the
        * auction, scored after. It began in July 2026 and will be thin for
        * months. This replays the SAME method over the archive so a reader has
        * something to judge today — but it is second, smaller, and labelled,
        * because a backtest is evidence of a weaker kind and presenting it
        * first would be putting the flattering number where the honest one
        * belongs.
        *
        * It leads with the middle-half figure rather than the full-range one.
        * The full range hits far more often and reads better; the middle half
        * is the number that shows the method is overconfident. Leading with
        * the good one and burying the bad one is how an honest calculation
        * becomes a dishonest page. */}
      {bt && bt.claims > 0 && (
        <div className="mt-4 border-t border-sand-200 pt-3">
          <p className="text-xs font-semibold text-ink-soft">
            Before the ledger existed: the same method, replayed on {bt.claims} past auctions
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Its stated middle range contained the actual clearing rate{' '}
            <span className="num font-semibold">
              {Math.round((100 * bt.hitMiddleHalf) / bt.claims)}%
            </span>{' '}
            of the time. A well-judged middle range should be right about half the time, so{' '}
            <strong>the range we quote is too narrow</strong> — it sounds more certain than the
            method has earned. The wider low-to-high range did contain it{' '}
            <span className="num">{Math.round((100 * bt.hitRange) / bt.claims)}%</span> of the
            time, and the typical miss was{' '}
            <span className="num">{bt.medianAbsErrorPp.toFixed(2)}</span> percentage points
            {bt.medianBiasPp < 0 ? ', usually quoting below what the auction paid' : ', usually quoting above what the auction paid'}.
          </p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-ink-faint hover:text-gold-700">
              What this test can and cannot tell you
            </summary>
            <ul className="mt-1.5 space-y-1 text-ink-faint">
              <li>
                Covers {bt.firstAuction} to {bt.lastAuction}. The archive reaches back to 2009, but
                guidance only draws on auctions from 2022 — CBK&apos;s older records are missing the
                clearing rate about a fifth of the time, so a longer test would be quoting a sample
                we cannot vouch for.
              </li>
              <li>
                At each auction the range was rebuilt using only auctions dated <em>before</em> it.
                Nothing from the day itself or afterwards was used.
              </li>
              <li>
                The method was designed by people who had already seen this history. No amount of
                careful testing removes that advantage.
              </li>
              <li>
                Auctions in the same rate cycle move together, so {bt.claims} results tell you
                considerably less than {bt.claims} independent tries would.
              </li>
              <li>It says nothing about the future. The next shock will not look like the last.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
