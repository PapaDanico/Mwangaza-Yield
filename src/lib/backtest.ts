/**
 * What the bid assistant WOULD have said, replayed over seventeen years.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE TRACK RECORD
 *
 * The live ledger (predictions.ts) is the real credibility artefact: ranges
 * recorded before the auction, scored against CBK's published result, with a
 * recordedOn date proving each was a forecast rather than a memory. Nothing
 * here replaces it and nothing here should be presented as if it did.
 *
 * But the ledger began in July 2026 and, on the day this was written, held
 * five predictions and ZERO resolved outcomes. A page that says only "no
 * results yet" tells a reader nothing about whether the method works, and a
 * reader deciding whether to trust a quoted range deserves better than a
 * promise. The archive holds 387 auctions back to 2009. The method can be
 * replayed against them.
 *
 * THE ONE THING THAT MAKES A BACKTEST HONEST
 *
 * No lookahead. At each historical auction the guidance is rebuilt using ONLY
 * prints dated strictly BEFORE that auction — never the auction itself, never
 * anything after it. This is the entire discipline: a backtest that peeks is
 * not a weak backtest, it is a fabrication, and it will always look excellent.
 * `pointInTimePrints` is the only route to the comparable set here, and the
 * test suite asserts that including the target auction changes the answer —
 * because if it did not, the filter would be decorative.
 *
 * WHAT A BACKTEST CANNOT TELL YOU, STATED HERE RATHER THAN IN SMALL PRINT
 *
 *  - The method was designed by people who had already seen this history. That
 *    is hindsight bias and no amount of point-in-time filtering removes it.
 *  - Auctions are not independent. Adjacent auctions in one rate regime rise
 *    and fall together, so 300 results are worth far less than 300 coin flips
 *    and the effective sample is much smaller than the count suggests.
 *  - It says nothing about the future. 2011 and 2015 rate spikes are in here;
 *    the next shock will not resemble them.
 *
 * The UI states these beside the number. A backtest presented without its
 * limits is marketing wearing the clothes of evidence.
 */

import type { AuctionPrint, Bond } from '../types/bond';
import { normaliseCode, clearingRate } from './auction-history';
import { bidGuidance, yearsToMaturityAt } from './bid';

/**
 * Prints strictly before `asOf`. The only way the backtest is allowed to see
 * the archive.
 *
 * Strictly before, not on-or-before: several bonds can settle on one auction
 * date, and including same-day prints would let a bond's own result — or its
 * neighbour's, set in the same room by the same bidders — inform the forecast
 * of it. That is the subtle version of lookahead, and the one most likely to
 * survive review because it looks like an off-by-one rather than a cheat.
 */
export function pointInTimePrints(prints: AuctionPrint[], asOf: string): AuctionPrint[] {
  return prints.filter((p) => p.auctionDate < asOf);
}

export interface BacktestResult {
  issueCode: string;
  auctionDate: string;
  actualRate: number;
  low: number;
  p25: number;
  median: number;
  p75: number;
  high: number;
  sampleSize: number;
  thin: boolean;
  hitRange: boolean;
  hitMiddleHalf: boolean;
  /** Signed error in percentage points: median forecast minus what happened. */
  errorPp: number;
}

export interface BacktestSummary {
  /** Auctions that could be replayed at all. */
  tested: number;
  /** Of those, the ones where the comparable set was thick enough to be a claim. */
  claims: number;
  hitRange: number;
  hitMiddleHalf: number;
  /** Median ABSOLUTE error, in percentage points. Robust to the 2011 spike. */
  medianAbsErrorPp: number;
  /** Positive means the method reads high — quotes a rate above the outturn. */
  medianBiasPp: number;
  firstAuction: string | null;
  lastAuction: string | null;
}

/**
 * Replay the guidance over every auction that has a published clearing rate.
 *
 * `minPriorPrints` exists because the earliest auctions in the archive have
 * almost nothing behind them, and scoring a forecast built from two
 * observations measures the thinness of 2009 rather than the quality of the
 * method. They are skipped rather than counted as failures, and the count of
 * what was skipped is implicit in `tested` against the archive size.
 */
export function backtest(
  prints: AuctionPrint[],
  bonds: Bond[],
  opts: { minPriorPrints?: number } = {}
): BacktestResult[] {
  const minPrior = opts.minPriorPrints ?? 20;
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  /* An undated print cannot be replayed point-in-time — there is no "before"
   * to filter on — and it cannot safely sit in the comparable pool either,
   * since it might be from after the auction being forecast. Dropped from both
   * roles rather than defaulted to some date, which would silently invent the
   * ordering the whole exercise depends on. The archive carries a handful. */
  const chronological = [...prints]
    .filter((p) => typeof p.auctionDate === 'string' && p.auctionDate.length > 0)
    .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
  const out: BacktestResult[] = [];

  for (const print of chronological) {
    const actual = clearingRate(print);
    if (actual === null) continue; // buybacks and taps carry no clearing rate

    const prior = pointInTimePrints(chronological, print.auctionDate);
    if (prior.length < minPrior) continue;

    const known = byCode.get(normaliseCode(print.issueCode));
    const labelTenor = parseFloat(print.issueCode.split('/')[2]);
    const target = known
      ? yearsToMaturityAt(known, new Date(print.auctionDate))
      : labelTenor;
    if (!Number.isFinite(target) || target <= 0) continue;

    const taxExempt = known ? known.taxExempt : print.issueCode.startsWith('IFB');
    const g = bidGuidance(prior, bonds, target, { taxExempt });
    if (!g.count) continue;

    out.push({
      issueCode: print.issueCode,
      auctionDate: print.auctionDate,
      actualRate: actual,
      low: g.low,
      p25: g.p25,
      median: g.median,
      p75: g.p75,
      high: g.high,
      sampleSize: g.count,
      thin: g.thin,
      hitRange: actual >= g.low && actual <= g.high,
      hitMiddleHalf: actual >= g.p25 && actual <= g.p75,
      errorPp: g.median - actual,
    });
  }
  return out;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function summariseBacktest(results: BacktestResult[]): BacktestSummary {
  /* Thin forecasts are excluded from the hit rates for the same reason the
   * live ledger excludes them: the assistant marks them as not-a-claim when it
   * shows them, so counting them here would score the product for something it
   * explicitly declined to assert. */
  const claims = results.filter((r) => !r.thin);
  const dates = results.map((r) => r.auctionDate).sort();
  return {
    tested: results.length,
    claims: claims.length,
    hitRange: claims.filter((r) => r.hitRange).length,
    hitMiddleHalf: claims.filter((r) => r.hitMiddleHalf).length,
    medianAbsErrorPp: median(claims.map((r) => Math.abs(r.errorPp))),
    medianBiasPp: median(claims.map((r) => r.errorPp)),
    firstAuction: dates[0] ?? null,
    lastAuction: dates[dates.length - 1] ?? null,
  };
}
