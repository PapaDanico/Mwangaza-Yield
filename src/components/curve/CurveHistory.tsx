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
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { curveRows, curveToCSV, TENOR_BUCKETS, CURVE_MIN_BUCKETS } from '@/lib/yield-curve';
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
  const [failed, setFailed] = useState(false);

  const rows = useMemo(
    () => (auctionResults.length ? curveRows(auctionResults, bonds) : []),
    [auctionResults, bonds]
  );

  const drawable = rows.filter((r) => r.drawable);
  const sparse = rows.filter((r) => !r.drawable);

  /* Recharts wants one object per X value with a key per series, so the shape
   * is transposed here: rows are tenors, columns are years. A year with a gap
   * at some tenor simply has no key for it, and `connectNulls` bridges it
   * rather than breaking the line — the gap is an auction that did not happen,
   * not a yield that fell to zero. */
  const data = TENOR_BUCKETS.map((b) => {
    const point: Record<string, number | string> = { tenor: b.label, years: b.years };
    for (const row of drawable) {
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

  const first = drawable[0].year;
  const last = drawable[drawable.length - 1].year;

  return (
    <div>
      <div className="h-80 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d3" />
            <XAxis dataKey="tenor" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={['dataMin - 1', 'dataMax + 1']}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]}
              labelFormatter={(l: string) => `${l} tenor`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {drawable.map((row, i) => (
              <Line
                key={row.year}
                type="monotone"
                dataKey={String(row.year)}
                stroke={COLOURS[i % COLOURS.length]}
                strokeWidth={row.year === last ? 2.5 : 1.5}
                dot={{ r: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        Each line is one year, drawn only from bond auctions held in that year, so its shape is the
        market&apos;s rather than an accident of when each bond was last sold. Every point is the
        median clearing rate — what accepted bidders actually got — across that year&apos;s
        auctions at that tenor.
      </p>

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
