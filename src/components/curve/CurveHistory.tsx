'use client';

/**
 * The yield curve, one line per year, from auctions held in that year.
 *
 * The reason to plot it this way rather than as a single "current" curve is
 * that every point on a year's line cleared within that year, so the shape is
 * the market's and not the calendar's. Stacking the years then shows the thing
 * a Kenyan saver actually lived through: the 2021 trough, the 2023-24 spike
 * that put short yields above long ones, and the easing since.
 */

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Download } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';

/* Deferred: see CurveHistoryPlot. The placeholder holds the chart's height so
   the table below it does not jump when the plot arrives. */
const CurveHistoryPlot = dynamic(() => import('./CurveHistoryPlot'), {
  ssr: false,
  loading: () => <div className="h-80 w-full" aria-hidden="true" />,
});
import { curveRows, curveToCSV, curveContext, TENOR_BUCKETS, CURVE_MIN_BUCKETS } from '@/lib/yield-curve';
import { annualInflation, realCurveRows, partialYearNote } from '@/lib/real-curve';
import DataState from '@/components/shared/DataState';

/* Distinct enough to tell apart at a glance, and ordered so the most recent
 * years are the most saturated — the reader is usually here for "now" and the
 * history is context behind it. */
const COLOURS = [
  '#cbd5e1', '#a8b3c4', '#93a3b8', '#7b8ca3', '#64748b',
  '#b45309', '#d97706', '#0f766e', '#15803d', '#1e3a5f',
];

export default function CurveHistory() {
  const bonds = useBondStore((s) => s.bonds);
  const auctionResults = useBondStore((s) => s.auctionResults);
  const cbrHistory = useBondStore((s) => s.cbrHistory);
  const cpiHistory = useBondStore((s) => s.cpiHistory);
  const [failed, setFailed] = useState(false);
  const [real, setReal] = useState(false);

  const rows = useMemo(
    () => (auctionResults.length ? curveRows(auctionResults, bonds) : []),
    [auctionResults, bonds]
  );

  const drawable = rows.filter((r) => r.drawable);
  const context = useMemo(
    () => curveContext(drawable.map((r) => r.year), cbrHistory),
    [drawable, cbrHistory]
  );
  const sparse = rows.filter((r) => !r.drawable);

  /* THE REAL CURVE, AND WHY THE TOGGLE IS OFF BY DEFAULT.
   *
   * Nominal is what CBK published and what every other source quotes, so it is
   * the figure a reader arrives able to check us on. Real terms is the more
   * useful number and the less familiar one; making it the default would have
   * the chart disagree with every other page about Kenya on first sight.
   *
   * `realCurveRows` DROPS a year it cannot deflate rather than passing it
   * through nominal, so the real view can legitimately show fewer lines than
   * the nominal one. That is the honest outcome — a deflated line and an
   * undeflated one on one axis under one legend would be two quantities
   * pretending to be one. */
  const inflationByYear = useMemo(() => annualInflation(cpiHistory), [cpiHistory]);
  const realYears = useMemo(
    () => realCurveRows(drawable, inflationByYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, inflationByYear]
  );
  const canShowReal = realYears.length > 0;
  const showingReal = real && canShowReal;
  const shown = showingReal ? realYears : drawable;
  const droppedForReal = showingReal ? drawable.length - realYears.length : 0;

  /* Recharts wants one object per X value with a key per series, so the shape
   * is transposed here: rows are tenors, columns are years. A year with a gap
   * at some tenor simply has no key for it, and `connectNulls` bridges it
   * rather than breaking the line — the gap is an auction that did not happen,
   * not a yield that fell to zero. */
  const data = TENOR_BUCKETS.map((b) => {
    const point: Record<string, number | string> = { tenor: b.label, years: b.years };
    for (const row of shown) {
      const cell = row.cells.find((c) => c.label === b.label);
      if (cell) point[String(row.year)] = cell.rate;
    }
    return point;
  });

  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([curveToCSV(rows)], { type: 'text/csv;charset=utf-8' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mwangaza-kenya-yield-curve.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Say the download did not happen rather than leave a button that merely
      // looked pressed — the same posture as the archive download.
      setFailed(true);
    }
  }

  if (!auctionResults.length) return <DataState />;
  if (!drawable.length) {
    return (
      <p className="text-sm text-ink-muted">
        Not enough auctions carry a published clearing rate to draw a curve for any year. Nothing
        is shown rather than a line through one point.
      </p>
    );
  }

  const first = shown[0]?.year;
  const last = shown[shown.length - 1]?.year;

  return (
    <div>
      {canShowReal && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Label-wrapped so the whole phrase is the hit target, not the 16px
              box — the WCAG 2.5.8 fix applied across this app. */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={real}
              onChange={(e) => setReal(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            Show what savers kept, after tax and inflation
          </label>
          {showingReal && (
            <span className="text-xs text-ink-faint">
              Nominal is what CBK published; this is what it was worth.
            </span>
          )}
        </div>
      )}

      <div className="h-80 w-full">
        <CurveHistoryPlot data={data} shown={shown} last={last} colours={COLOURS} />
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        Each line is one year, drawn only from bond auctions held in that year, so its shape is the
        market&apos;s rather than an accident of when each bond was last sold. Every point is the
        median clearing rate — what accepted bidders actually got — across that year&apos;s
        auctions at that tenor.
        {showingReal && (
          <>
            {' '}
            Each point is then reduced by withholding tax — 10% at ten years or longer, 15% below
            it — and by that year&apos;s average inflation. A point below zero means money placed
            that year bought less at the end of it than at the start, however healthy the headline
            rate looked.
          </>
        )}
      </p>

      {showingReal && droppedForReal > 0 && (
        <p className="mt-2 text-xs text-ink-faint">
          <strong className="tabular-nums">{droppedForReal}</strong>{' '}
          {droppedForReal === 1 ? 'year is' : 'years are'} not drawn here: we hold no inflation
          reading for {droppedForReal === 1 ? 'it' : 'them'}. Showing those lines undeflated beside
          the rest would put two different quantities on one axis.
        </p>
      )}

      {showingReal && partialYearNote(realYears) && (
        <p className="mt-2 text-xs text-ink-faint">{partialYearNote(realYears)}</p>
      )}

      {/* THE POLICY RATE BESIDE THE CURVE IT RULED
        *
        * A curve does not move on its own, and the Central Bank Rate is the
        * biggest published influence on it. This is the one historical context
        * the archive can genuinely supply: 119 dated MPC decisions since 2008,
        * against a CPI series of which we hold only today's print.
        *
        * Deliberately a table of two published series and no more. No
        * correlation, no share of the move attributed to policy, nothing about
        * what either does next. The interesting reading is the one the numbers
        * make available on their own — that in 2023 and 2024 the short end
        * moved considerably further than the CBR did — and stating that as a
        * computed finding would be a model wearing the clothes of a fact. */}
      {context.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft hover:text-gold-700">
            What the Central Bank was doing in each of these years
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1 pr-3 font-medium">Year</th>
                  <th className="py-1 pr-3 font-medium">CBR at year end</th>
                  <th className="py-1 pr-3 font-medium">Moves</th>
                  <th className="py-1 font-medium">Net change</th>
                </tr>
              </thead>
              <tbody className="text-ink-soft">
                {context.map((c) => (
                  <tr key={c.year} className="border-t border-sand-200">
                    <td className="num py-1.5 pr-3 font-medium text-ink">{c.year}</td>
                    <td className="num py-1.5 pr-3">
                      {c.cbrPct === null ? '—' : `${c.cbrPct.toFixed(2)}%`}
                    </td>
                    <td className="num py-1.5 pr-3">{c.decisions}</td>
                    <td className="num py-1.5">
                      {c.netMoveBps === 0 ? (
                        <span className="text-ink-faint">no change</span>
                      ) : (
                        <span className={c.netMoveBps > 0 ? 'text-red-600' : 'text-mint-700'}>
                          {c.netMoveBps > 0 ? '+' : ''}
                          {c.netMoveBps} bps
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            The rate shown is the one in force at the end of the year, since that is what the
            year&apos;s later auctions cleared against — a year with no MPC decision still has a
            policy rate, the previous one. Source: CBK MPC press releases, every one of which is
            linked from the dashboard&apos;s rate history.
          </p>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold-500 px-4 text-sm font-semibold text-ink"
        >
          <Download size={16} aria-hidden="true" />
          Download the curve (CSV)
        </button>
        <span className="text-xs text-ink-faint">
          {rows.flatMap((r) => r.cells).length} rows, {first}–{last} plus the sparse years
        </span>
      </div>
      {failed && (
        <p className="mt-2 text-sm text-red-600">
          The download did not start. If you are offline, try again once you have a connection.
        </p>
      )}

      {/* WHAT IS NOT DRAWN, SAID ON THE PAGE RATHER THAN IN A COMMENT
        *
        * The archive reaches back to 2009 and this chart starts much later.
        * Leaving that unexplained invites the reader to assume the earlier
        * years were dull; they were not, they are missing. */}
      {sparse.length > 0 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-ink-faint hover:text-gold-700">
            Why the chart does not go back further
          </summary>
          <div className="mt-1.5 space-y-1.5 text-ink-faint">
            <p>
              CBK&apos;s older auction documents often do not publish a clearing rate, so for{' '}
              {sparse.map((r) => r.year).join(', ')} there are too few priced auctions to make a
              curve — fewer than {CURVE_MIN_BUCKETS} of the six tenor bands have a single result.
              A line drawn through one point is not a curve, so those years are left out of the
              chart.
            </p>
            <p>
              They are still in the CSV, with the number of auctions behind every figure, so you
              can see exactly how thin they are instead of taking our word for it.
            </p>
          </div>
        </details>
      )}

      {/* NOT INSIDE THE `sparse` BLOCK, WHERE IT STARTED
        *
        * This began life in the disclosure above, which only renders when some
        * year is too thin to draw. That made a permanent statement about WHAT
        * IS MEASURED conditional on an unrelated data accident: backfill the
        * early years and the chart would quietly stop mentioning that it omits
        * infrastructure bonds. A caveat that can disappear on its own is not a
        * caveat. */}
      <p className="mt-3 text-xs text-ink-faint">
        Fixed-coupon bonds only. Infrastructure bonds are exempt from withholding tax, so their
        yields are not measuring the same thing, and averaging the two would quietly understate
        the long end where most of them sit.
      </p>
    </div>
  );
}
