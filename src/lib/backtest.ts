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
import { normaliseCode, clearingRate, auctionKind } from './auction-history';
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
    /* THE COMMENT HERE USED TO READ "buybacks and taps carry no clearing
     * rate". Half of that was true. `clearingRate` nulls buybacks and nothing
     * else, so 65 tap sales and 6 switches — 71 of the 317 rate-bearing prints
     * in the archive — were being replayed as though they were competitive
     * auctions, and their outcomes are in the hit rate this page publishes.
     *
     * A tap sells at a fixed price and a switch is a debt exchange; neither
     * asks the market what it wants to be paid, which is the only question the
     * guidance range is answering. Backtesting against them measures the
     * method on a question it was never posed.
     *
     * The comment was the giveaway: an assumption written down as though it
     * were enforced, in the one file whose output is a public claim. */
    if (auctionKind(print) !== 'issuance') continue;
    const actual = clearingRate(print);
    if (actual === null) continue;

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

/* ------------------------------------------------------- bias, by regime */

/**
 * How many of the most recent replayed auctions count as "the regime we are
 * in now".
 *
 * Twenty-four is about two years of bond auctions on CBK's current cadence —
 * long enough that one surprising print cannot set the sign, short enough to
 * sit entirely inside the easing cycle that began in 2025. It is a judgement
 * and it is stated here rather than buried at a call site.
 */
export const RECENT_CLAIMS = 24;

/**
 * The median bias over the most recent claims, or null when there are too few.
 *
 * WHY A SECOND BIAS NUMBER, WHEN ONE WAS ALREADY PUBLISHED
 *
 * `summariseBacktest` measures bias over everything replayed, and on 22
 * September 2026 that came to **-0.14pp** — the method quoting slightly BELOW
 * what auctions paid. TrackRecord printed exactly that: "usually quoting below
 * what the auction paid".
 *
 * Sliced by era, the same archive says the opposite about now:
 *
 *     all (97 claims)   -0.14pp
 *     2024+ (74)        +0.34pp
 *     2025+ (53)        +0.52pp
 *     2026  (26)        +0.51pp
 *
 * The sign flipped because Kenyan yields fell hard through 2025-26, and a
 * method built from past prints lags a falling market. The live ledger says
 * the same thing far more bluntly: all three scored predictions missed, every
 * one of them BELOW the quoted range — the direction the page was telling
 * readers not to expect.
 *
 * So the published sentence was not false about the seventeen-year record and
 * was wrong about the only question a bidder has, which is what to expect on
 * Thursday. That is this repository's most familiar defect — a true figure
 * answering a question nobody asked — and it is the same shape as the reader
 * banner that reported pipeline liveness to somebody pricing a bond.
 *
 * Returns null rather than a number when the sample is short, so a caller
 * cannot mistake "too early to say" for "no bias". Absence is not zero.
 */
export function recentBiasPp(
  results: BacktestResult[],
  window: number = RECENT_CLAIMS
): number | null {
  const claims = results
    .filter((r) => !r.thin)
    .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
  if (claims.length < window) return null;
  return median(claims.slice(-window).map((r) => r.errorPp));
}

/** Which way the method currently leans, in words a bidder can act on. */
export function biasPhrase(biasPp: number): string {
  return biasPp < 0
    ? 'usually quoting below what the auction paid'
    : 'usually quoting above what the auction paid';
}
