/**
 * The yield curve in real terms — what a saver actually kept, year by year.
 *
 * WHY THIS IS THE POINT OF THE CPI HISTORY
 * ----------------------------------------
 * `CurveHistory` draws one nominal line per year and its header already names
 * what the reader is looking for: "the 2021 trough, the 2023-24 spike that put
 * short yields above long ones, and the easing since". Nominally, 2023 looks
 * like the best year in the series to have been a lender. It was not. Headline
 * inflation ran near 7.7% that year, and a saver's purchasing power grew far
 * less than the line suggests — in some years, not at all.
 *
 * That correction was impossible until `cpi-history.json` existed, and
 * `real-terms.ts` said so in its own docstring for months. It exists now.
 *
 * THE CHAIN, AND WHY EACH LINK IS NEEDED
 * --------------------------------------
 * `curveRows` yields a median CLEARING RATE: gross, before any tax. Deflating
 * that directly would answer a question nobody has — nobody receives a gross
 * coupon. The honest chain is
 *
 *     gross clearing rate  ->  net of withholding tax  ->  real
 *
 * and the tax step is not a constant. Kenyan WHT on bond interest is 10% at ten
 * years or longer and 15% below it, which `determineWHTRate` already encodes
 * and this module defers to rather than restating. So the 2y and 5y buckets are
 * taxed harder than the 15y and 20y ones, and a real curve computed with one
 * flat rate would tilt in a direction the market did not.
 *
 * Infrastructure bonds, which are exempt, never reach here: `curveRows` drops
 * them before bucketing. Their exclusion is the reason a flat non-zero WHT is
 * safe to apply at all.
 *
 * WHICH INFLATION FIGURE FOR A YEAR
 * ---------------------------------
 * A year's line aggregates auctions held across that whole year, so the
 * deflator has to be a whole-year figure, not one month's print. This averages
 * that year's twelve monthly 12-month readings.
 *
 * It deliberately does NOT reuse CBK's own "Annual Average Inflation" column,
 * even though that column exists and is arguably the more official statistic:
 * the scraper stores only the 12-month series, and inventing a second source of
 * truth for the same idea is how two figures that should agree quietly stop
 * agreeing. If the annual column is ever collected, this should read it rather
 * than compute an approximation of it — and say so on screen.
 *
 * A PARTIAL YEAR IS REPORTED, NOT HIDDEN
 * --------------------------------------
 * The current year has fewer than twelve months of CPI. Refusing it would blank
 * the line readers care about most; averaging it silently would present seven
 * months as a year. So `monthsUsed` travels with every figure, and a surface
 * that renders the number without it is rendering an unlabelled approximation.
 */

import { realRate } from './real-yield';
import { determineWHTRate } from './financial-engine';
import type { CurveYear, CurveCell } from './yield-curve';

export interface CpiReading {
  /** First of the month the figure describes. */
  date: string;
  value: number;
}

export interface AnnualInflation {
  year: number;
  /** Mean of that year's monthly 12-month readings. */
  pct: number;
  /** How many months went into it. Fewer than 12 means a partial year. */
  monthsUsed: number;
}

/** Below this, an average is too thin to deflate a whole year's auctions. */
export const MIN_MONTHS_FOR_YEAR = 3;

/**
 * Mean 12-month inflation per calendar year, with its sample size attached.
 *
 * Rows with an unparseable date or a non-finite value are skipped rather than
 * poisoning a year's mean — one bad row should cost one month, not the year.
 */
export function annualInflation(readings: CpiReading[]): Map<number, AnnualInflation> {
  const byYear = new Map<number, number[]>();
  for (const r of readings) {
    if (!r || typeof r.date !== 'string' || !Number.isFinite(r.value)) continue;
    const year = Number(r.date.slice(0, 4));
    if (!Number.isInteger(year) || year < 1900) continue;
    const seen = byYear.get(year);
    if (seen) seen.push(r.value);
    else byYear.set(year, [r.value]);
  }

  const out = new Map<number, AnnualInflation>();
  for (const [year, values] of byYear) {
    if (values.length < MIN_MONTHS_FOR_YEAR) continue;
    const pct = values.reduce((a, b) => a + b, 0) / values.length;
    out.set(year, { year, pct: Math.round(pct * 1000) / 1000, monthsUsed: values.length });
  }
  return out;
}

export interface RealCurveCell extends CurveCell {
  /** The gross clearing rate, unchanged — kept so the tax bite stays legible. */
  grossRate: number;
  /** After withholding tax, before inflation. */
  netRate: number;
  /** After tax AND inflation. `rate` carries this so charts need no branch. */
  realRate: number;
  whtRate: number;
}

export interface RealCurveYear extends Omit<CurveYear, 'cells'> {
  cells: RealCurveCell[];
  inflation: AnnualInflation;
}

/**
 * Deflate each year's curve by that year's inflation.
 *
 * A year with no usable CPI is DROPPED rather than passed through nominal.
 * Mixing a deflated 2023 line with an undeflated 2026 one in the same chart
 * would put two different quantities on one axis under one legend, and the
 * reader has no way to tell which line is which. A missing year is visible;
 * a silently nominal one is not.
 */
export function realCurveRows(
  rows: CurveYear[],
  inflationByYear: Map<number, AnnualInflation>
): RealCurveYear[] {
  const out: RealCurveYear[] = [];
  for (const row of rows) {
    const inflation = inflationByYear.get(row.year);
    if (!inflation) continue;
    const cells = row.cells.map((cell) => {
      // Defer to the engine's own rule rather than restating it: 10% at ten
      // years or longer, 15% below. `taxExempt: false` is safe because
      // curveRows drops infrastructure bonds before bucketing.
      const whtRate = determineWHTRate({ taxExempt: false, tenorYears: cell.years });
      const netRate = cell.rate * (1 - whtRate);
      const real = realRate(netRate, inflation.pct);
      return {
        ...cell,
        grossRate: cell.rate,
        netRate: Math.round(netRate * 1000) / 1000,
        realRate: Math.round(real * 1000) / 1000,
        whtRate,
        rate: Math.round(real * 1000) / 1000,
      };
    });
    out.push({ ...row, cells, inflation });
  }
  return out;
}

/**
 * One sentence a surface can print beside a real curve, or null if there is
 * nothing to qualify.
 *
 * Returned from here rather than written in a component so that the caveat
 * cannot be rendered without the figure it qualifies — the same construction
 * `where-to-save.ts` uses for the SACCO range, and for the same reason: a
 * caveat a component may omit is one that eventually gets omitted.
 */
export function partialYearNote(years: RealCurveYear[]): string | null {
  const partial = years.filter((y) => y.inflation.monthsUsed < 12);
  if (!partial.length) return null;
  const described = partial
    .map((y) => `${y.year} (${y.inflation.monthsUsed} month${y.inflation.monthsUsed === 1 ? '' : 's'})`)
    .join(', ');
  return `Inflation for ${described} is an average of the months published so far, not a full year.`;
}
