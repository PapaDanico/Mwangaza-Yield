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
  opts: {
    minPriorPrints?: number;
    calibrate?: boolean;
    /**
     * Optional sink for the RAW result of each auction, filled as the
     * calibrated pass goes. The calibrated pass builds the raw guidance
     * anyway, so handing it out costs nothing and saves a second traversal —
     * see backtestPair. Ignored when `calibrate` is off, where the returned
     * results already are the raw ones.
     */
    collectRaw?: BacktestResult[];
  } = {}
): BacktestResult[] {
  const minPrior = opts.minPriorPrints ?? 20;
  /* THE CORRECTION MUST BE EARNED, AUCTION BY AUCTION
   *
   * With `calibrate`, each auction is forecast using a shift derived ONLY
   * from errors the method had already made by that date — the same single
   * forward pass the live path gets, never a figure fitted to the whole
   * archive. Fitting the shift over everything and then reporting the hit
   * rate would be the lookahead this file exists to forbid, wearing the
   * clothes of an improvement.
   *
   * The rolling errors collected below are the RAW ones, because that is the
   * quantity being corrected; feeding corrected errors back in would chase
   * its own tail.
   */
  const calibrate = opts.calibrate === true;
  const rawErrors: number[] = [];
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
    /* Raw first: it is what the rolling error history is made of, and with
     * `calibrate` off it is also the answer. */
    const raw = bidGuidance(prior, bonds, target, { taxExempt });
    if (!raw.count) continue;
    const correctionPp =
      calibrate && rawErrors.length >= CORRECTION_WINDOW
        ? median(rawErrors.slice(-CORRECTION_WINDOW))
        : 0;
    const g = calibrate
      ? bidGuidance(prior, bonds, target, { taxExempt, correctionPp, bandScale: BAND_SCALE })
      : raw;
    if (!raw.thin) rawErrors.push(raw.median - actual);
    if (calibrate && opts.collectRaw) {
      opts.collectRaw.push({
        issueCode: print.issueCode,
        auctionDate: print.auctionDate,
        actualRate: actual,
        low: raw.low,
        p25: raw.p25,
        median: raw.median,
        p75: raw.p75,
        high: raw.high,
        sampleSize: raw.count,
        thin: raw.thin,
        hitRange: actual >= raw.low && actual <= raw.high,
        hitMiddleHalf: actual >= raw.p25 && actual <= raw.p75,
        errorPp: raw.median - actual,
      });
    }

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

/**
 * Which way the method leans, in words a bidder can act on.
 *
 * Kept after `recentBiasPp` was retired. That function measured the lag over
 * a 24-claim window so the page could WARN about it, which was the right fix
 * while the method was not being changed. It is superseded: the lag is now
 * corrected at source by `guidanceCalibration`, and a warning about a bias
 * that has already been subtracted would be describing a problem the reader
 * no longer has.
 *
 * Retiring it also removed a contradiction. A 24-claim window read +0.42pp
 * while a 12-claim window read -0.29pp, because the error series genuinely
 * turns in late May 2026 — consistently positive before it, mostly negative
 * after. Two windows on one page would have disagreed in SIGN about the same
 * question, which is worse than either answer alone.
 */
export function biasPhrase(biasPp: number): string {
  return biasPp < 0
    ? 'usually quoting below what the auction paid'
    : 'usually quoting above what the auction paid';
}

/* ------------------------------------------------- calibrating the method */

/**
 * How many past claims the lag correction is measured over.
 *
 * Twelve is roughly a year of bond auctions on CBK's cadence. It was chosen
 * from a grid — every window from 8 to 24 improves every metric, so this sits
 * in the middle of a plateau rather than on a tuned spike, which is the only
 * defensible way to pick a constant like this:
 *
 *     window   range hit (all / 2025+)   median bias 2025+
 *      raw          54% / 49%                 +0.52
 *        8          70% / 66%                 -0.13
 *       12          66% / 64%                 +0.08
 *       16          66% / 66%                 +0.05
 *       24          59% / 55%                 +0.10
 *
 * Twelve is not the maximum of that table. Eight scores better on range and
 * worse on bias, and a shift fitted to eight auctions swings around; twelve
 * lands the bias nearest zero from the positive side while keeping most of
 * the range gain. Picking the row with the best single number would be how
 * this constant goes stale the first time the cycle turns.
 */
export const CORRECTION_WINDOW = 12;

/**
 * How much the p25..p75 band is widened.
 *
 * The raw band contained the outturn 22% of the time; an interquartile band
 * should manage about 50%. Measured with the correction in place:
 *
 *     scale   middle half (all / 2025+)
 *      1.0         48% / 43%
 *      1.75        53% / 47%
 *      2.0         57% / 55%
 *
 * 1.75 straddles the 50% target from both sides. 2.0 overshoots, and a band
 * that contains the answer MORE than half the time is overclaiming
 * uncertainty in the other direction — wide enough to be useless is its own
 * kind of dishonest.
 */
export const BAND_SCALE = 1.75;

export interface GuidanceCalibration {
  /** Percentage points to subtract, or 0 when not yet earned. */
  correctionPp: number;
  bandScale: number;
  /** Past claims the correction was measured over; below the window it is 0. */
  sample: number;
}

/**
 * The correction the LIVE guidance should carry, from the archive as it stands.
 *
 * Distinct from the rolling shift inside `backtest`: there, each auction may
 * only use errors predating it. Here every auction in the archive has already
 * happened, so the most recent `CORRECTION_WINDOW` errors are all legitimately
 * available — and using them is not lookahead, it is just reading the past.
 *
 * Returns a 0 correction, not a guess, when the archive is too short. Absence
 * is not zero anywhere else in this codebase; here 0 IS the honest neutral,
 * because it means "quote the raw distribution", and `sample` says so plainly
 * rather than leaving a caller to infer it from the number.
 */
/**
 * Memo on the exact input arrays, because this is called from render.
 *
 * `guidanceCalibration` replays the whole archive — ~90ms on a development
 * machine and several times that on the mid-range Android this audience
 * actually uses. `/auctions/` calls it from two independent components
 * (BidAssistant and TrackRecord), and each React memo only dedupes within its
 * own component, so the work was being done twice for one identical answer.
 *
 * Keyed on array IDENTITY, not contents. The store hands every consumer the
 * same two arrays, so identity is exactly the right key and is free to
 * compare; hashing the contents would cost more than the thing being cached.
 * A WeakMap means a replaced archive is collected rather than pinned.
 */
const calibrationMemo = new WeakMap<AuctionPrint[], WeakMap<Bond[], GuidanceCalibration>>();

export function guidanceCalibration(
  prints: AuctionPrint[],
  bonds: Bond[]
): GuidanceCalibration {
  const byBonds = calibrationMemo.get(prints);
  const hit = byBonds?.get(bonds);
  if (hit) return hit;
  const computed = computeCalibration(prints, bonds);
  if (byBonds) byBonds.set(bonds, computed);
  else calibrationMemo.set(prints, new WeakMap([[bonds, computed]]));
  return computed;
}

function computeCalibration(
  prints: AuctionPrint[],
  bonds: Bond[]
): GuidanceCalibration {
  return calibrationFrom(backtest(prints, bonds));
}

/**
 * The calibration implied by a set of RAW replay results.
 *
 * Split out so `backtestPair` can derive it from the raw results it already
 * collected instead of replaying the archive again for the same answer. Both
 * routes must agree, and a test asserts they do.
 */
export function calibrationFrom(rawResults: BacktestResult[]): GuidanceCalibration {
  const claims = rawResults.filter((r) => !r.thin);
  if (claims.length < CORRECTION_WINDOW) {
    return { correctionPp: 0, bandScale: BAND_SCALE, sample: 0 };
  }
  const recent = [...claims]
    .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate))
    .slice(-CORRECTION_WINDOW);
  return {
    correctionPp: median(recent.map((r) => r.errorPp)),
    bandScale: BAND_SCALE,
    sample: recent.length,
  };
}


export interface BacktestPair {
  /** The method as it quotes today: lag corrected, band widened. */
  calibrated: BacktestResult[];
  /** The same method with both adjustments off — the measuring stick. */
  raw: BacktestResult[];
  calibration: GuidanceCalibration;
}

/**
 * Both replays and the live calibration, from ONE traversal of the archive.
 *
 * TrackRecord needs all three to show the before-and-after honestly, and
 * calling them separately replayed the archive three times — 277ms of
 * main-thread work on a development machine, for one page, every render. The
 * calibrated pass already builds the raw guidance internally (it is what the
 * rolling error history is made of), so the raw result is a by-product rather
 * than a second pass, and the calibration falls out of the raw errors.
 *
 * This is a performance shape, not a different measurement: a test asserts it
 * returns exactly what the separate calls do.
 */
export function backtestPair(prints: AuctionPrint[], bonds: Bond[]): BacktestPair {
  const rawPass: BacktestResult[] = [];
  const calibrated = backtest(prints, bonds, { calibrate: true, collectRaw: rawPass });
  const calibration = calibrationFrom(rawPass);
  /* Prime the shared memo. BidAssistant asks for the calibration on the same
   * page from its own component, and it is the identical answer off the
   * identical arrays — there is no reason for it to replay the archive to
   * rediscover what this pass just computed. */
  primeCalibration(prints, bonds, calibration);
  return { calibrated, raw: rawPass, calibration };
}

function primeCalibration(
  prints: AuctionPrint[],
  bonds: Bond[],
  value: GuidanceCalibration
): void {
  const byBonds = calibrationMemo.get(prints);
  if (byBonds) byBonds.set(bonds, value);
  else calibrationMemo.set(prints, new WeakMap([[bonds, value]]));
}
