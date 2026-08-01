'use client';

/**
 * What the printed income is worth once prices have moved.
 *
 * WHY THE PRINTOUT NEEDS THIS MORE THAN THE SCREEN DOES
 *
 * Every figure on these sheets is nominal. "Net income Ksh 2,883,965 a year"
 * is what the coupons pay, and a Kenyan government bond pays the same shillings
 * in year twelve as in year one — so the income is fixed and the shopping it
 * buys is not.
 *
 * The screen at least sits inside an app that says so elsewhere. A printed
 * sheet carries only itself. GoalReport's own comment makes the point about a
 * different figure: a printout "is exactly what somebody budgets from, and it
 * outlives the session that produced it". A retirement or school-fees plan is
 * read years after the day it was made, which is precisely the horizon over
 * which this matters most.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not restate anything in real terms, and it does not forecast. The
 * erosion shown is arithmetic on ONE published CPI print held constant, which
 * is an assumption and a poor one — Kenyan inflation ran above 9% in 2023 and
 * 3.2% in the core basket this month. Holding a rate constant for a decade is
 * how the old FIRE calculator produced numbers in the tens of millions. So the
 * figure is labelled as an illustration, dated, and attributed.
 *
 * It renders nothing when there is no CPI to quote. A sheet that silently
 * omits the caveat is better than one that invents the rate behind it.
 */

import { useMemo } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { latestInflation } from '@/lib/real-yield';
import { inflationSplit } from '@/lib/inflation-split';

/** Illustrative horizons. Long enough to matter, short enough to be credible. */
const HORIZONS = [10, 20];

export default function RealTermsNote() {
  const macro = useBondStore((s) => s.macro);
  const cpi = useMemo(() => latestInflation(macro), [macro]);
  const split = useMemo(() => inflationSplit(macro), [macro]);

  // No published rate, no claim. See the header.
  if (!cpi || !Number.isFinite(cpi.rate) || cpi.rate <= 0) return null;

  /* Expressed as a share of today's purchasing power, deliberately NOT as a
   * shilling figure.
   *
   * The first draft said "Ksh 100 of that income would buy about Ksh 53" — and
   * the smoke test's agreement check caught it: every Ksh amount on the sheet
   * is compared against the screen, because a figure corrected on the page and
   * left stale in the report is how a printout starts lying. "Ksh 100" was a
   * rhetorical baseline, not a plan figure, and the guard was right to refuse
   * it. A percentage carries the same fact and makes no claim about shillings
   * anybody holds. */
  const keeps = (years: number) => 100 / Math.pow(1 + cpi.rate / 100, years);

  return (
    <p className="mt-3 text-[10px] leading-relaxed text-ink-muted">
      <strong>These are nominal shillings.</strong> A government bond pays the same coupon
      every year, so the income above is fixed while prices are not. At the latest published
      inflation of <span className="num">{cpi.rate.toFixed(1)}%</span>, held flat purely to
      illustrate, the same income would buy about{' '}
      {HORIZONS.map((y, i) => (
        <span key={y}>
          {i > 0 ? ' and ' : ''}
          <span className="num">{keeps(y).toFixed(0)}%</span> of today&apos;s shopping in {y}{' '}
          years
        </span>
      ))}
      .
      {split && (
        <>
          {' '}That average hides a split: food and energy rose{' '}
          <span className="num">{split.nonCore.toFixed(1)}%</span> over the past year while
          everything else rose <span className="num">{split.core.toFixed(1)}%</span>, so a
          household spending more of its money on food and transport loses ground faster than
          this shows.
        </>
      )}
      {' '}Inflation is not forecast here — it moves, and holding one month&apos;s figure flat
      for a decade is an assumption, not a projection. Source: {cpi.source}
      {cpi.fallback ? ' (a stand-in, not the official publisher)' : ''}, {cpi.asOf}.
    </p>
  );
}
