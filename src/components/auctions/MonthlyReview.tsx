import { ClipboardList } from 'lucide-react';
import auctionsData from '../../../public/data/auction-results.json';
import type { AuctionPrint } from '@/types/bond';
import {
  archiveIsPublishable,
  availableMonths,
  buildMonthlyReview,
  evidenceLine,
} from '@/lib/auction-review';
import Explain from '@/components/shared/Explain';

const PRINTS = auctionsData as unknown as AuctionPrint[];

/**
 * The most recent month of auctions, as the government experienced it.
 *
 * WHAT THIS ANSWERS THAT NOTHING ELSE HERE DOES
 * ---------------------------------------------
 * `DemandRecord` describes the last twelve auctions as a run — how contested
 * the market has been lately. This describes ONE MONTH as an event: what the
 * Treasury asked for, what turned up, and what it was willing to take. A
 * bidder deciding what rate to ask reads those differently. A median over a
 * year says what is normal; last month says what is happening.
 *
 * WHY IT TOOK SO LONG TO SHIP
 * ---------------------------
 * `auction-review.ts` has been finished and tested for a long time and no
 * reader could see any of it, because its own header held it back until the
 * archive was uniform at the current parser version. That gate was prose,
 * and prose has two failure modes: nobody notices when it clears, and nobody
 * notices when it CANNOT clear. Three records at parser versions 5 and 7 came
 * from the legacy /images/docs/ path that the incremental parser no longer
 * walks, so they could never be re-read, and the gate as written would have
 * blocked this permanently while looking like it was waiting.
 *
 * The gate is now `archiveIsPublishable`, it is called RIGHT HERE, and it
 * demands only that every row this can actually use be current. So the
 * condition that governs publication is the condition the code checks, and
 * if the archive ever goes mid-rebuild again this card disappears on its own
 * rather than quietly averaging two parsers' output.
 *
 * Static import rather than the store: a store-gated component pre-renders
 * empty under `output: export`, which is how the QEBR panel shipped built,
 * tested and invisible.
 */
export default function MonthlyReview() {
  if (!archiveIsPublishable(PRINTS).ok) return null;

  const months = availableMonths(PRINTS);
  if (!months.length) return null;
  const r = buildMonthlyReview(PRINTS, months[0]);
  if (!r.auctionCount) return null;

  const x = (v: number) => `${v.toFixed(2)}x`;
  const bn = (m: number) => `${(m / 1000).toFixed(1)}bn`;

  // Only say "above"/"below" when there is a prior median to compare against.
  // One month beside nothing is a number, not a comparison.
  const vsPrior =
    r.medianCover !== undefined && r.priorMedianCover !== undefined
      ? r.medianCover - r.priorMedianCover
      : undefined;

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <ClipboardList size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">
          {r.label}: what the government asked for, and what turned up
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {r.totalOfferedKESM !== undefined && (
          <>
            The Treasury offered{' '}
            <strong className="tabular-nums">Ksh {bn(r.totalOfferedKESM)}</strong>
            {r.totalAcceptedKESM !== undefined && (
              <>
                {' '}and took{' '}
                <strong className="tabular-nums">
                  Ksh {bn(r.totalAcceptedKESM)}
                </strong>
                {r.uptakePct !== undefined && (
                  <> — {r.uptakePct.toFixed(0)}% of the amount advertised</>
                )}
              </>
            )}
            .{' '}
          </>
        )}
        {r.medianCover !== undefined && (
          <>
            Bids came to a median of{' '}
            <strong className="tabular-nums">{x(r.medianCover)}</strong> the
            amount offered
            {r.priorMedianCover !== undefined && (
              <>
                , against{' '}
                <strong className="tabular-nums">{x(r.priorMedianCover)}</strong>{' '}
                over the preceding {r.priorMonthsCounted} month
                {r.priorMonthsCounted === 1 ? '' : 's'}
              </>
            )}
            .
          </>
        )}
      </p>

      {vsPrior !== undefined && Math.abs(vsPrior) >= 0.15 && (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {vsPrior > 0
            ? 'More money chased this month than has been usual lately. When bids run well above the offer, aggressive bids get rejected and the clearing rate settles lower — a non-competitive bid takes whatever that turns out to be.'
            : 'Less money turned up this month than has been usual lately. Auctions that fall short tend to clear at higher rates, because the Treasury has to reach further to fill the book. That is good for a buyer, and it is also the market telling you why.'}
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="pb-1 font-medium">Auction</th>
              <th className="pb-1 font-medium">Type</th>
              <th className="pb-1 text-right font-medium">Bid</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={`${row.date}-${row.issueCodes.join()}`} className="border-t border-sand-200">
                <td className="py-1.5 text-ink-soft">
                  {row.date}
                  <span className="block text-[11px] text-ink-faint">
                    {row.issueCodes.join(', ') || '—'}
                  </span>
                </td>
                <td className="py-1.5 text-ink-faint">{row.kind}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold text-ink">
                  {/* A blank is the honest cell. A switch raises no cash and a
                      tap sale is fixed-price, so neither has a cover ratio —
                      printing 0.13x for a switch reads as a failed auction
                      when nothing failed. */}
                  {row.bidToCover === undefined ? '—' : x(row.bidToCover)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">{evidenceLine(r)}</p>

      <Explain label="What counts as an auction here, and what is left blank">
        Only primary issuances produce a bid-to-cover ratio. A switch is a debt
        exchange that raises no cash and a tap sale is a fixed-price top-up where
        under-filling is routine; both sit in the archive at figures like 0.82x and
        0.13x that read as failed auctions when nothing failed. They are shown as rows
        with a blank ratio rather than hidden, because they are real auctions and
        leaving them out would misstate how much borrowing happened.
        {' '}
        The amount offered is an auction-level figure that CBK repeats against every
        bond in a multi-bond sale, so it is counted ONCE PER DATE. Summing it across
        rows would multiply the government&apos;s borrowing target by the number of
        bonds on offer, silently.
        {' '}
        A ratio outside a deliberately wide plausible band is discarded and counted as
        excluded rather than reported. Twenty-four rows in the archive carry the bids
        figure in billions against an offered figure in millions — a parser fault, not
        a market event. A cover of 0.001 is not a story about weak demand.
        {' '}
        The line above states the evidence base: how many auctions this saw and how
        many it could actually measure. &ldquo;Three auctions, two measurable&rdquo; is
        worth more than quietly averaging the two and calling it the month.
        {' '}
        This is computation, not commentary. Every figure comes from CBK&apos;s own
        published results and can be checked against the PDF each row was read from.
        Nothing here recommends a course of action and nothing here is a forecast.
      </Explain>
    </div>
  );
}
