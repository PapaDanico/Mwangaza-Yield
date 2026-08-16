/**
 * Did saving in Treasury bills actually make a Kenyan money?
 *
 * WHY THIS QUESTION AND NOT ANOTHER
 * ---------------------------------
 * Every rate on this site is a snapshot: today's 91-day bill pays 7.68% net,
 * and with July's CPI at 6.49% that leaves 1.12% in real terms. True, and it
 * answers "is this week's auction worth bidding on".
 *
 * It does not answer the question a saver actually has, which is whether this
 * instrument has ever been a good place to keep money. A single positive month
 * says nothing about a decade — and Kenya has had years where the headline
 * rate looked generous and inflation quietly took all of it. A reader deciding
 * where to put a year's savings deserves the record, not the snapshot.
 *
 * WHAT REAL MEANS HERE, PRECISELY
 * -------------------------------
 * Three deductions, in the order they actually happen:
 *
 *   1. The quoted discount rate is not a return. CBK quotes a true discount;
 *      `computeTBill` converts it to an effective annual yield.
 *   2. Withholding tax at 15% comes off the interest.
 *   3. Inflation is removed by the Fisher relation, NOT by subtraction.
 *
 * The third is where most published "real rate" figures go wrong. Subtracting
 * gives a number that is close and consistently wrong in the flattering
 * direction: at 7.68% net against 6.49% CPI, subtraction says 1.19% where the
 * honest figure is 1.12%. Over a decade of monthly readings that bias
 * accumulates into a story about savers being better off than they were.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not forecast, and it does not annualise a partial year into a claim
 * about a full one. It pairs each auction with the inflation print that was
 * current WHEN THAT AUCTION HAPPENED — not the latest print, which would
 * rewrite history every month, and not a forward-looking estimate, which would
 * be a projection wearing a measurement's clothes.
 *
 * A reading with no CPI print within `MAX_CPI_GAP_DAYS` is dropped rather than
 * matched to a distant one. Kenya's CPI is monthly, so a gap wider than that
 * means one of the two series has a hole, and pairing across it would invent a
 * real return nobody experienced.
 *
 * THE YIELD IS NOT RECOMPUTED HERE
 * -------------------------------
 * `computeTBill` is imported rather than reimplemented, and the first draft of
 * this file is why. It applied withholding to the effective yield —
 * `gross * 0.85` — which reads as obviously right and is wrong: the tax falls
 * on the INTEREST, and the yield has to be recomputed from what is actually
 * received. On today's 91-day bill that is 7.72% against the 7.68% every other
 * surface shows, four basis points too generous, in a history where the error
 * would repeat on every reading and always in the same direction.
 *
 * A second implementation of the same arithmetic is a second thing to keep
 * right. There is one.
 */

import { computeTBill } from './tbills';

/**
 * How far a CPI print may be from an auction before the pair is refused.
 *
 * CPI is published monthly, so 45 days allows the normal case — an auction in
 * the second half of a month whose print lands in the first days of the next —
 * while refusing to reach across a missing month.
 */
export const MAX_CPI_GAP_DAYS = 45;

export interface RatePoint {
  /** ISO date of the auction. */
  date: string;
  /** CBK's quoted discount rate, as a percentage. */
  discountRate: number;
  tenorDays: number;
}

export interface CpiPoint {
  /** ISO date of the print. */
  date: string;
  /** Annual inflation as a percentage. */
  value: number;
}

export interface RealReading {
  date: string;
  tenorDays: number;
  /** Effective annual yield before tax, as a percentage. */
  grossPct: number;
  /** After 15% withholding. */
  netPct: number;
  /** The CPI print in force at the auction. */
  inflationPct: number;
  /** What was left, by the Fisher relation. */
  realPct: number;
  /** The date of the CPI print used, so a reader can check the pairing. */
  inflationAsOf: string;
}

const DAY = 86_400_000;

/** The CPI print in force on `date`: the most recent one at or before it. */
function cpiInForce(date: string, cpi: CpiPoint[]): CpiPoint | null {
  const t = Date.parse(date);
  let best: CpiPoint | null = null;
  for (const point of cpi) {
    const pt = Date.parse(point.date);
    if (pt > t) continue;
    if (!best || pt > Date.parse(best.date)) best = point;
  }
  if (!best) return null;
  return (t - Date.parse(best.date)) / DAY <= MAX_CPI_GAP_DAYS ? best : null;
}

/**
 * One real reading per auction that can be honestly paired with a CPI print.
 *
 * Auctions with no usable print are omitted, not zero-filled: a gap in the
 * record is a gap, and a chart that quietly interpolates one is telling a
 * reader something nobody measured.
 */
export function realHistory(rates: RatePoint[], cpi: CpiPoint[]): RealReading[] {
  const out: RealReading[] = [];
  for (const r of rates) {
    const print = cpiInForce(r.date, cpi);
    if (!print) continue;
    // One face value is as good as another: both yields are rates.
    const computed = computeTBill(1_000_000, r.discountRate, r.tenorDays);
    const grossPct = computed.grossEAY;
    const netPct = computed.netEAY;
    // Fisher, not subtraction. See the header.
    const realPct = ((1 + netPct / 100) / (1 + print.value / 100) - 1) * 100;
    out.push({
      date: r.date,
      tenorDays: r.tenorDays,
      grossPct: Math.round(grossPct * 100) / 100,
      netPct: Math.round(netPct * 100) / 100,
      inflationPct: print.value,
      realPct: Math.round(realPct * 100) / 100,
      inflationAsOf: print.date,
    });
  }
  return out;
}

export interface RealRecord {
  readings: number;
  /** Auctions whose net yield did not keep pace with prices. */
  losingReadings: number;
  /** Share of readings that lost to inflation, 0..1. */
  losingShare: number;
  worst: RealReading | null;
  best: RealReading | null;
  /** Median real return across the readings, as a percentage. */
  medianRealPct: number;
}

/**
 * The record, summarised for a sentence a reader can act on.
 *
 * The median rather than the mean: a single hyperinflationary month would drag
 * an average into a figure no saver experienced, and this exists to describe
 * the typical year rather than the arithmetic of the extremes.
 */
export function realRecord(readings: RealReading[]): RealRecord {
  if (!readings.length) {
    return {
      readings: 0,
      losingReadings: 0,
      losingShare: 0,
      worst: null,
      best: null,
      medianRealPct: 0,
    };
  }
  const losing = readings.filter((r) => r.realPct < 0);
  const sorted = [...readings].sort((a, b) => a.realPct - b.realPct);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1].realPct + sorted[mid].realPct) / 2
      : sorted[mid].realPct;
  return {
    readings: readings.length,
    losingReadings: losing.length,
    losingShare: losing.length / readings.length,
    worst: sorted[0],
    best: sorted[sorted.length - 1],
    medianRealPct: Math.round(median * 100) / 100,
  };
}
