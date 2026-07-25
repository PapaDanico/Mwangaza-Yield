import archiveData from '../../../public/data/auction-results.json';
import {
  availableMonths,
  buildMonthlyReview,
  evidenceLine,
  type MonthlyReview,
} from '@/lib/auction-review';
import { formatCompactKES } from '@/lib/utils';
import type { AuctionPrint } from '@/types/bond';

/**
 * The monthly auction review, rendered for reading and for printing.
 *
 * It reports three things and refuses to report a fourth. What the Treasury
 * asked for, what the market bid, and what was accepted — all published by CBK,
 * all linkable back to the PDF each row came from. What it does not do is tell
 * anyone what to buy. That distinction is what keeps this a research note
 * rather than investment advice, and it is not a formality.
 *
 * Where a figure is missing the cell is empty. Where a figure was present but
 * impossible — the billions-for-millions misparse described in auction-review.ts
 * — the row says "unreadable" rather than printing a number that would read as
 * a collapse in demand. A note is worth buying only if its gaps are visible.
 */
const PRINTS = archiveData as unknown as AuctionPrint[];

/** The newest month that has at least one auction we could measure — a note
 *  about a month we could not read is not worth sending. */
function latestReviewable(): MonthlyReview | null {
  for (const m of availableMonths(PRINTS)) {
    const r = buildMonthlyReview(PRINTS, m);
    if (r.measured > 0) return r;
  }
  return null;
}

const review = latestReviewable();

function Cover({ row }: { row: NonNullable<MonthlyReview['rows']>[number] }) {
  if (row.bidToCover !== undefined) {
    return <span className="num">{row.bidToCover.toFixed(2)}&times;</span>;
  }
  if (row.coverRejected) {
    return <span className="text-xs italic text-ink-muted">unreadable</span>;
  }
  return <span className="text-ink-muted">—</span>;
}

export default function AuctionReview() {
  if (!review) {
    return (
      <p className="text-ink-muted">
        No month in the archive currently carries auction figures complete enough to review.
      </p>
    );
  }

  const { label, rows, medianCover, priorMedianCover, priorMonthsCounted } = review;
  const direction =
    medianCover !== undefined && priorMedianCover !== undefined
      ? medianCover > priorMedianCover
        ? 'above'
        : medianCover < priorMedianCover
          ? 'below'
          : 'level with'
      : null;

  return (
    <article>
      <header>
        <h2 className="font-display text-2xl font-bold text-ink">
          Treasury bond auctions — {label}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{evidenceLine(review)}</p>
      </header>

      {medianCover !== undefined && (
        <p className="mt-4 text-ink-soft">
          Demand came in at a median of <strong className="num">{medianCover.toFixed(2)}&times;</strong>{' '}
          the amount offered
          {direction && priorMedianCover !== undefined ? (
            <>
              {' '}— {direction} the{' '}
              <span className="num">{priorMedianCover.toFixed(2)}&times;</span> median of the
              preceding {priorMonthsCounted} month{priorMonthsCounted === 1 ? '' : 's'}
            </>
          ) : null}
          . A figure below 1.00&times; means the market bid less than the Treasury sought.
        </p>
      )}

      {/* Phone: one block per auction. The table below needs 34rem and a reader
          on a 390px screen would have had to discover a sideways scroll to see
          cover and uptake — which are the whole point of the note. A document
          people forward on WhatsApp has to read on the device it arrives on. */}
      <ul className="mt-5 space-y-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.date} className="rounded-xl border border-sand-300 bg-sand-50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="num text-sm font-semibold text-ink">{row.date}</span>
              <span className="text-sm">
                <Cover row={row} />
                <span className="ml-1 text-xs text-ink-muted">cover</span>
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{row.issueCodes.join(', ')}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {[
                { k: 'Offered', v: row.offeredKESM ? formatCompactKES(row.offeredKESM * 1e6) : '—' },
                { k: 'Accepted', v: row.acceptedKESM ? formatCompactKES(row.acceptedKESM * 1e6) : '—' },
                { k: 'Uptake', v: row.uptakePct !== undefined ? `${row.uptakePct.toFixed(0)}%` : '—' },
              ].map(({ k, v }) => (
                <div key={k}>
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="num font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-5 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Issues</th>
              <th className="py-2 pr-3 text-right font-semibold">Offered</th>
              <th className="py-2 pr-3 text-right font-semibold">Accepted</th>
              <th className="py-2 pr-3 text-right font-semibold">Cover</th>
              <th className="py-2 text-right font-semibold">Uptake</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date} className="border-b border-sand-200 align-top">
                <td className="num py-2 pr-3 whitespace-nowrap">{row.date}</td>
                <td className="py-2 pr-3">{row.issueCodes.join(', ')}</td>
                <td className="num py-2 pr-3 text-right">
                  {row.offeredKESM ? formatCompactKES(row.offeredKESM * 1e6) : '—'}
                </td>
                <td className="num py-2 pr-3 text-right">
                  {row.acceptedKESM ? formatCompactKES(row.acceptedKESM * 1e6) : '—'}
                </td>
                <td className="py-2 pr-3 text-right">
                  <Cover row={row} />
                </td>
                <td className="num py-2 text-right">
                  {row.uptakePct !== undefined ? `${row.uptakePct.toFixed(0)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        <strong>Cover</strong> is bids received divided by the amount offered.{' '}
        <strong>Uptake</strong> is the amount accepted divided by the amount offered — above 100%
        happens when the Treasury takes more than it advertised. Amounts offered are per auction,
        not per bond, so a three-bond auction counts once. Every figure is from CBK&apos;s published
        auction results; a dash means the figure was not in the document we could read, and
        &ldquo;unreadable&rdquo; means it was there but did not survive parsing.
      </p>

      <p className="mt-3 text-xs text-ink-muted">
        Analytics for education. Not investment advice, and not a forecast. Mwangaza Yield is not a
        licensed dealer, adviser or arranger, holds no client funds, and takes no position in any
        security named here.
      </p>
    </article>
  );
}
