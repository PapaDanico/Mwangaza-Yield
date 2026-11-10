'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { carryRollTable, type CarryRoll } from '@/lib/carry-rolldown';
import Reserve from '@/components/shared/Reserve';

/* A spread across the curve rather than the first eight: the shortest bonds
   alone would read as "short bonds only". */
const COLLAPSED_ROWS = 8;
/* Parallel moves in yield, in basis points, applied at the end of the year. */
const SHIFTS = [-200, -100, 0, 100, 200];
const shiftLabel = (v: number) => (v === 0 ? '0bp' : `${v > 0 ? '+' : '−'}${Math.abs(v)}bp`);

const pct = (v: number) => `${v.toFixed(2)}%`;
const range = (xs: number[], f: (v: number) => string) =>
  Math.min(...xs) === Math.max(...xs) ? f(xs[0]) : `${f(Math.min(...xs))} to ${f(Math.max(...xs))}`;

function spread(rows: CarryRoll[], n: number): CarryRoll[] {
  if (rows.length <= n) return rows;
  const out: CarryRoll[] = [];
  for (let i = 0; i < n; i++) out.push(rows[Math.round((i * (rows.length - 1)) / (n - 1))]);
  return out;
}

/**
 * What the curve pays you to wait a year: carry, roll-down and the yield
 * cushion for every bond the fitted curve reaches. The maths and its limits
 * are in `lib/carry-rolldown.ts`; this only lays it out and states, from the
 * numbers themselves, where the short and long ends differ.
 */
export default function CarryRolldown() {
  const bonds = useBondStore((s) => s.bonds);
  const loaded = useBondStore((s) => s.loaded);
  const [showAll, setShowAll] = useState(false);
  const [shift, setShift] = useState(0);
  const table = useMemo(() => (loaded ? carryRollTable(bonds, new Date(), 12, shift) : null), [bonds, loaded, shift]);

  if (!table) return <Reserve height={953} className="min-h-[1160px] sm:min-h-[953px]" />;

  const { fit, rows } = table;
  const shown = showAll ? rows : spread(rows, COLLAPSED_ROWS);
  const maxCushion = Math.max(...rows.map((r) => r.cushionBp));
  const short = rows.filter((r) => r.yearsLeft < 8);
  const long = rows.filter((r) => r.yearsLeft > 15);
  const contrast = short.length >= 2 && long.length >= 2;

  return (
    <section aria-labelledby="carry-heading" className="card mx-auto mt-6 max-w-2xl">
      <h2 id="carry-heading" className="text-lg font-semibold text-ink">
        What the curve pays you to wait a year
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        If yields stay exactly where they are, here is what each bond earns over the next twelve
        months after tax, how much of that is roll-down, and how far yields could rise before the
        year loses money. Then try a move in yields to see who is hurt.
      </p>

      <div className="mt-4">
        <div id="carry-shift-label" className="text-xs font-medium text-ink-muted">
          If yields move by the end of the year
        </div>
        <div role="radiogroup" aria-labelledby="carry-shift-label" className="mt-1.5 grid grid-cols-5 gap-1.5">
          {SHIFTS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-label={v === 0 ? 'No change in yields' : `Yields ${v > 0 ? 'rise' : 'fall'} ${Math.abs(v)} basis points`}
              aria-checked={shift === v}
              onClick={() => setShift(v)}
              className={`min-h-11 rounded-lg border px-1 text-xs font-semibold ${
                shift === v ? 'border-treasury-navy bg-treasury-navy text-sand-50' : 'border-sand-300 text-ink hover:bg-sand-50'
              }`}
            >
              {shiftLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {contrast && shift === 0 && (
        <p className="mt-3 rounded-xl border border-gold-300/60 bg-gold-500/[0.06] p-3 text-sm leading-relaxed text-ink">
          Bonds with under 8 years left earn <strong>{range(short.map((r) => r.netReturnPct), pct)}</strong>{' '}
          after tax and can absorb a rise of <strong>{range(short.map((r) => r.cushionBp), (v) => `${Math.round(v)}bp`)}</strong>.
          Bonds with over 15 years left earn <strong>{range(long.map((r) => r.netReturnPct), pct)}</strong>{' '}
          with a cushion of <strong>{range(long.map((r) => r.cushionBp), (v) => `${Math.round(v)}bp`)}</strong>.
          The yield is similar; the room for error is not.
        </p>
      )}
      {contrast && shift !== 0 && (
        <p className="mt-3 rounded-xl border border-gold-300/60 bg-gold-500/[0.06] p-3 text-sm leading-relaxed text-ink">
          If yields {shift > 0 ? 'rise' : 'fall'} by {Math.abs(shift)}bp, bonds with under 8 years left
          return <strong>{range(short.map((r) => r.shockedNetReturnPct), pct)}</strong> after tax for the
          year and bonds with over 15 years left return{' '}
          <strong>{range(long.map((r) => r.shockedNetReturnPct), pct)}</strong>.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Twelve-month return after tax for the selected yield move, with roll-down and yield cushion, by bond, years left under each name
          </caption>
          <thead>
            <tr className="border-b border-sand-300 text-xs text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-medium">Bond</th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">12-month return</th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">Roll-down</th>
              <th scope="col" className="py-2 text-right font-medium">Cushion</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.issueCode} className="border-b border-sand-200 last:border-0">
                <th scope="row" className="py-2.5 pr-2 font-medium text-ink">
                  {r.issueCode}
                  <span className="num block text-xs font-normal text-ink-muted">{r.yearsLeft.toFixed(1)} yrs left</span>
                </th>
                <td className="num py-2.5 pr-2 text-right font-semibold text-ink">{pct(r.shockedNetReturnPct)}</td>
                <td className="num py-2.5 pr-2 text-right text-ink-soft">+{r.rollDownPct.toFixed(2)}</td>
                <td className="py-2.5 text-right">
                  <span className="num text-ink">{Math.round(r.cushionBp)}bp</span>
                  <span aria-hidden="true" className="mt-1 block h-1 rounded-full bg-sand-200">
                    <span
                      className="block h-1 rounded-full bg-gold-600"
                      style={{ width: `${Math.max(4, (r.cushionBp / maxCushion) * 100)}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-sand-300 text-sm font-semibold text-ink hover:bg-sand-50"
        >
          {showAll ? 'Show fewer bonds' : `Show all ${rows.length} bonds`}
        </button>
      )}

      <details className="group mt-4 rounded-xl border border-sand-200 bg-sand-50/60 px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink marker:content-none">
          How this is worked out, and where it can be wrong
          <span aria-hidden className="text-lg text-gold-700 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 pb-4 text-sm leading-relaxed text-ink-soft">
          <p>
            Most bonds have no recent clearing yield, so each bond&apos;s own old yield would make its
            roll-down an artefact of the calendar. Instead one curve is fitted to the {fit.n} fixed
            coupon and savings development bonds priced in the last {fit.maxAgeDays} days (remaining
            life {fit.minYears.toFixed(1)} to {fit.maxYears.toFixed(1)} years), and every bond is
            read off it. The fit misses its own points by about {Math.round(fit.rmseBp)}bp on
            average, so treat a gap smaller than that between two bonds as no gap.
          </p>
          <p>
            <strong>Roll-down</strong> is the price gain from the bond moving to a shorter point on
            that curve as a year passes. <strong>Cushion</strong> is the parallel rise in yields, in
            basis points, that takes the twelve-month return to zero. Coupons carry withholding tax
            and price changes do not, as in the{' '}
            <Link href="/sell/" className="underline">sell calculator</Link>. Infrastructure bonds
            are left out because their yields sit on a different curve, and a bond whose shortened
            life falls outside the fitted range is left out rather than extrapolated.
          </p>
          <p>
            &ldquo;Yields stay put&rdquo; is a benchmark, not a forecast. It is the starting line for
            asking what a move would cost, which is what the cushion measures.
          </p>
        </div>
      </details>
    </section>
  );
}
