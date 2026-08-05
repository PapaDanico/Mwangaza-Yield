/**
 * What a rate is worth after inflation — the layer, not the card.
 *
 * `real-yield.ts` already does this arithmetic properly, and does it well: the
 * Fisher relation rather than subtraction, tax taken before inflation because
 * withholding is charged on the nominal coupon, and the principal's erosion
 * counted separately because a yield figure structurally cannot show it.
 *
 * The problem was never the maths. It was reach. On the day this was written,
 * `real-yield.ts` was imported by exactly two files — the calculator page and a
 * print note — so a reader who never opened the calculator saw only nominal
 * figures everywhere else on the site. 236 lines of the most useful analysis
 * here, arriving at one page.
 *
 * This module is the small shared piece the other surfaces need: given a net
 * rate and the CPI print the app already holds, what is left. It deliberately
 * does NOT duplicate `realReturn` — that function is bond-specific and knows
 * about maturity and principal. This is for the places that hold a plain
 * annual rate: a Treasury bill, a curve point, a savings product.
 *
 * STRICTLY DESCRIPTIVE
 * --------------------
 * Every figure here is a statement about the rate and the CPI print in front
 * of it, both of which are published and dated. Nothing is projected forward.
 * `realRate` applied to today's bill and today's CPI answers "what does this
 * rate keep, at today's inflation" — a fact about now. Applied to a 2019 yield
 * and a 2026 CPI print it would answer nothing at all, which is why
 * `realSeries` refuses a reading that is not contemporaneous with its rate.
 */

import type { MacroIndicator } from '../types/bond';
import { latestInflation, realRate, CPI_MAX_AGE_DAYS, type InflationReading } from './real-yield';

export interface RealTerms {
  /** The nominal rate, net of withholding tax where it applies. */
  netPct: number;
  /** The CPI y/y print used, and when it was published. */
  inflationPct: number;
  inflationAsOf: string;
  /** What is left after inflation, by the Fisher relation. */
  realPct: number;
  /** True when the rate does not keep pace with prices. */
  losesToInflation: boolean;
}

/**
 * A net rate expressed in real terms, or null when there is no usable CPI.
 *
 * Null rather than a guess: a real yield computed from a missing or stale
 * inflation print is a number with no meaning, and showing one is worse than
 * showing nothing. `latestInflation` already enforces CPI_MAX_AGE_DAYS.
 */
export function realTerms(netPct: number, macro: MacroIndicator[]): RealTerms | null {
  if (!Number.isFinite(netPct)) return null;
  const reading: InflationReading | null = latestInflation(macro);
  if (!reading) return null;
  /* A stale print is refused, not merely flagged.
   *
   * `latestInflation` returns the reading with `stale: true` past
   * CPI_MAX_AGE_DAYS and leaves the decision to the caller. That is right for
   * the calculator card, which shows the age beside the figure and lets a
   * reader judge it. It is wrong for a layer that appears in a line of text on
   * several pages: there is no room there to explain that the deflator is six
   * years old, and a real yield computed from a 2020 print is not a slightly
   * worse number, it is a different question answered. */
  if (reading.stale) return null;
  const realPct = realRate(netPct, reading.rate);
  return {
    netPct,
    inflationPct: reading.rate,
    inflationAsOf: reading.asOf,
    realPct,
    losesToInflation: realPct < 0,
  };
}

/**
 * Why a historical real curve is not published, stated in code rather than
 * left for someone to try.
 *
 * The obvious next move from `realTerms` is to run it down the yield curve and
 * draw what savers kept in each year. It cannot be done from the data this
 * project holds: `macro.json` carries the CURRENT CPI reading and no history,
 * so the only inflation figure available to pair with a 2019 clearing rate is
 * a 2026 one.
 *
 * That is not a small approximation. Kenyan headline inflation ran above 9% in
 * 2017, near 5% in 2020 and 9.6% in 2022; deflating every year's yields by one
 * recent print would invent a real curve whose shape is an artefact of a
 * single month's data. `real-yield.ts` says the same thing about holding one
 * print constant across a bond's life, and the reasoning is identical here.
 *
 * So this function exists to be honest about the gap and to fail loudly if
 * someone wires a historical series in without checking it is contemporaneous.
 * When a CPI history is collected, pass readings dated to each rate and this
 * becomes the real curve; until then it returns null for anything it cannot
 * date-match.
 */
export function realSeries(
  points: { date: string; netPct: number }[],
  cpiByDate: Map<string, number>,
  toleranceDays = 45
): { date: string; netPct: number; realPct: number }[] | null {
  if (!points.length || cpiByDate.size === 0) return null;
  const cpi = [...cpiByDate.entries()]
    .map(([date, rate]) => ({ t: new Date(date).getTime(), rate }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  if (!cpi.length) return null;

  const out: { date: string; netPct: number; realPct: number }[] = [];
  for (const p of points) {
    const t = new Date(p.date).getTime();
    if (!Number.isFinite(t)) return null;
    let best: { t: number; rate: number } | null = null;
    for (const c of cpi) {
      if (best === null || Math.abs(c.t - t) < Math.abs(best.t - t)) best = c;
    }
    // A rate paired with a CPI print from a different regime is not a real
    // yield, it is two unrelated numbers divided. Refusing the whole series
    // rather than dropping the point: a curve with silent holes reads as a
    // complete curve.
    if (!best || Math.abs(best.t - t) / 86_400_000 > toleranceDays) return null;
    out.push({ date: p.date, netPct: p.netPct, realPct: realRate(p.netPct, best.rate) });
  }
  return out;
}

export { CPI_MAX_AGE_DAYS };
