/**
 * Seventeen years of Kenyan government bond auctions, measured against what
 * prices did in the same month.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT `real-history.ts`
 * ---------------------------------------------------
 * `real-history.ts` answers the same question for Treasury BILLS, and it is
 * the better instrument to answer it with: bills are quoted on a true discount
 * basis, so `computeTBill` converts a quote into a return exactly. The problem
 * is that this app has no bill history. `public/data/tbills.json` holds three
 * rows — the current 91, 182 and 364 — and nothing has ever accumulated them.
 * So the engine sits built, tested and idle, waiting on a dataset that does
 * not exist yet.
 *
 * Meanwhile `public/data/auction-results.json` holds 315 dated bond auctions
 * with a weighted average accepted rate, running from July 2009 to August
 * 2026, and `public/data/cpi-history.json` holds 259 monthly inflation prints
 * back to 2005. The record a saver actually wants — "has lending to this
 * government ever been a good place to keep money?" — is answerable today,
 * from data already in the repository, over a longer span than the bill
 * archive would give even once it lands.
 *
 * WHERE THIS IS APPROXIMATE, AND IN WHICH DIRECTION
 * ------------------------------------------------
 * The net yield here is `gross x (1 - w)`, and that is an approximation. It is
 * EXACT for a bond clearing at par, and it UNDERSTATES the net return for one
 * clearing below par, because the pull to par is a capital gain and Kenyan
 * withholding tax falls on interest, not on gains from government securities.
 *
 * The direction is the reason this approximation is acceptable and a different
 * one would not be. Every claim this module supports — how often government
 * paper beat inflation, what the typical real return was — is a claim that
 * would be flattering if overstated. An error that can only run the other way
 * makes those claims conservative. `netPct` is asserted never to exceed
 * `grossPct` in the tests, so a future change cannot quietly reverse it.
 *
 * This is deliberately NOT solved through `solveYTMFromPrice`, which would be
 * exact. That solver needs a coupon, a maturity and a settlement date; the
 * auction archive carries a clearing rate and often a price, and reconstructing
 * the rest per row would mean inventing the inputs to a precise answer. A
 * stated approximation with a known sign beats a precise-looking number built
 * on guesses.
 *
 * WITHHOLDING IS READ FROM THE ISSUE CODE
 * --------------------------------------
 * Kenya taxes bond interest at 10% at ten years and over, 15% below, and not
 * at all on infrastructure bonds. The archive has no `taxExempt` flag, but the
 * issue code carries both facts: `IFB1/2023/6.5` is an infrastructure bond,
 * `FXD1/2022/010` a ten-year fixed-coupon one. Getting the IFB case wrong
 * would tax the one instrument this whole app argues is the best deal
 * available to a Kenyan retail investor, so it is pinned by a test.
 */

import { normaliseCode } from './auction-history';
import { cpiInForce, type CpiPoint } from './real-history';

export type { CpiPoint };

/** A dated auction print with a clearing rate, as auction-results.json holds it. */
export interface SovereignPrint {
  issueCode: string;
  auctionDate: string | null;
  weightedAverageRate?: number | null;
}

export interface SovereignReading {
  issueCode: string;
  date: string;
  /** Weighted average accepted rate at the auction, as a percentage. */
  grossPct: number;
  /** After withholding at the rate this issue attracts. */
  netPct: number;
  /** The withholding rate applied, 0 / 0.10 / 0.15 — so a reader can check it. */
  whtRate: number;
  /** The CPI print in force at the auction. */
  inflationPct: number;
  /** What was left, by the Fisher relation. */
  realPct: number;
  /** The date of the CPI print used, so the pairing can be checked. */
  inflationAsOf: string;
}

/**
 * A clearing rate outside this band is a misparse, not an auction.
 *
 * Kenyan government paper has cleared between roughly 5% and 20% across the
 * whole archive. A zero, a negative, or a 100 is a column that shifted, and
 * plotting it would put a spike in a seventeen-year chart that no auction
 * produced. `auction_results.py` guards its own extraction; this guards what
 * reaches a reader regardless of which parser version wrote the row.
 */
export const RATE_MIN = 2;
export const RATE_MAX = 30;

/**
 * The withholding rate this issue attracts, from its code alone.
 *
 * Mirrors `determineWHTRate` in financial-engine.ts, which needs a full `Bond`
 * with a `taxExempt` flag and a numeric tenor. The archive has neither, only
 * the code — so the rule is restated over the one input available rather than
 * a fake `Bond` being assembled to reach the original.
 */
export function whtForCode(issueCode: string): number {
  const code = normaliseCode(issueCode);
  if (code.startsWith('IFB')) return 0;
  const tenor = Number(code.split('/')[2]);
  if (!Number.isFinite(tenor)) return 0.15;
  return tenor >= 10 ? 0.1 : 0.15;
}

/**
 * One real reading per auction that can be honestly paired with a CPI print.
 *
 * Undated prints, prints with no clearing rate, prints outside the plausible
 * band, and prints with no CPI within the pairing window are all dropped — not
 * zero-filled. A gap in the record is a gap, and a chart that interpolates one
 * is showing a reader something nobody measured.
 */
export function sovereignReadings(
  prints: SovereignPrint[],
  cpi: CpiPoint[]
): SovereignReading[] {
  const out: SovereignReading[] = [];
  for (const p of prints) {
    if (!p.auctionDate) continue;
    const gross = p.weightedAverageRate;
    if (typeof gross !== 'number' || !Number.isFinite(gross)) continue;
    if (gross < RATE_MIN || gross > RATE_MAX) continue;
    const print = cpiInForce(p.auctionDate, cpi);
    if (!print) continue;
    const whtRate = whtForCode(p.issueCode);
    const netPct = gross * (1 - whtRate);
    // Fisher, not subtraction: at 12% net against 8% inflation, subtracting
    // says 4.00 where the honest figure is 3.70. Small, always flattering,
    // and repeated across three hundred readings.
    const realPct = ((1 + netPct / 100) / (1 + print.value / 100) - 1) * 100;
    out.push({
      issueCode: normaliseCode(p.issueCode),
      date: p.auctionDate,
      grossPct: Math.round(gross * 100) / 100,
      netPct: Math.round(netPct * 100) / 100,
      whtRate,
      inflationPct: print.value,
      realPct: Math.round(realPct * 100) / 100,
      inflationAsOf: print.date,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface SovereignRecord {
  readings: number;
  /** Auctions whose net clearing rate did not keep pace with prices. */
  losingReadings: number;
  /** Share of readings that lost to inflation, 0..1. */
  losingShare: number;
  worst: SovereignReading | null;
  best: SovereignReading | null;
  /** Median real return across the readings, as a percentage. */
  medianRealPct: number;
  /** ISO date of the earliest reading, so the span can be stated honestly. */
  from: string | null;
  /** ISO date of the latest reading. */
  to: string | null;
  /**
   * The years in which any auction lost to inflation, ascending.
   *
   * Computed rather than described. The first draft of the surface above this
   * said the losses sat "almost entirely in 2011", which was written from the
   * worst reading's year and was wrong the moment it was checked: five fall in
   * 2011, four in 2012 and two in 2017. A sentence about clustering is exactly
   * the kind of claim that reads as harmless colour and is a factual assertion
   * about the data, so it is derived from the data and cannot drift from it.
   */
  losingYears: string[];
}

/**
 * Below this many readings there is no record, only a handful of prints.
 *
 * The summary sentence this feeds — "government paper beat inflation in N of
 * the last M auctions" — reads as a statement about a market. Twelve is a
 * year of monthly auctions; under that the same sentence would be a statement
 * about a quarter wearing a market's clothes, so `summariseSovereign` returns
 * null and the surface renders nothing rather than something thin.
 */
export const MIN_READINGS = 12;

/**
 * The record, or null when there is not enough of one to describe.
 *
 * The median rather than the mean, for the same reason `realRecord` uses it:
 * 2011's spike would drag an average into a figure no saver experienced, and
 * this exists to describe the typical auction rather than the arithmetic of
 * the extremes.
 */
export function summariseSovereign(
  readings: SovereignReading[]
): SovereignRecord | null {
  if (readings.length < MIN_READINGS) return null;
  const losing = readings.filter((r) => r.realPct < 0);
  const byReal = [...readings].sort((a, b) => a.realPct - b.realPct);
  const mid = Math.floor(byReal.length / 2);
  const median =
    byReal.length % 2 === 0
      ? (byReal[mid - 1].realPct + byReal[mid].realPct) / 2
      : byReal[mid].realPct;
  const byDate = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  return {
    readings: readings.length,
    losingReadings: losing.length,
    losingShare: losing.length / readings.length,
    worst: byReal[0],
    best: byReal[byReal.length - 1],
    medianRealPct: Math.round(median * 100) / 100,
    from: byDate[0].date,
    to: byDate[byDate.length - 1].date,
    losingYears: [...new Set(losing.map((r) => r.date.slice(0, 4)))].sort(),
  };
}
