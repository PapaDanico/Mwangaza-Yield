// What should I bid?
//
// The auction radar tells a reader WHEN a sale closes. It has never told them
// what to put in the box, which is the only part that costs money. CBK runs
// interest-rate auctions: you name a rate, and if it is above the cut-off your
// bid is rejected outright, while a rate too far below it hands the Treasury a
// discount you did not have to give. The evidence for a sensible number is
// public and sitting in the archive — 387 results back to 2009 — but nobody
// reads a folder of PDFs before bidding.
//
// TWO TRAPS, both found by measuring the data before designing anything.
//
// 1. The tenor in the issue code is not the tenor being bid.
//    More than half of recent auctions are RE-OPENINGS of existing paper, and
//    the code keeps its original label for life. FXD2/2013/015 is a "15-year"
//    bond, and when it was re-opened it had 5.7 years left to run. Bucketing on
//    the label compares a five-year bid against fifteen-year history and gives
//    confident, wrong guidance. Everything here buckets on REMAINING TERM at
//    the auction date.
//
// 2. Bid-to-cover cannot be computed per record.
//    `amountOfferedKESM` is the amount offered for the WHOLE auction, repeated
//    on every bond in it. Dividing one bond's bids by it reads 0.61x — a market
//    in permanent collapse — where the truth, grouped by auction, is 1.20x.
//    Demand here is therefore computed per AUCTION DATE and never per row.
//
// Rates are safe per record: `weightedAverageRate` is the rate that specific
// bond cleared at, and it is present on 100% of 2022+ results.

import type { AuctionPrint, Bond } from '../types/bond';
import { normaliseCode, clearingRate } from './auction-history';

/**
 * Guidance is drawn from 2022 onward only.
 *
 * Coverage of every field this needs is 100% from 2022 and patchy before it —
 * `weightedAverageRate` is missing on roughly a fifth of the full archive. The
 * older records are still worth showing as context, but a headline number
 * built on them would be quoting a sample we cannot vouch for.
 */
export const GUIDANCE_FROM = '2022';

/** Below this many comparable auctions, say so rather than imply a distribution. */
export const MIN_SAMPLE = 5;

const DAYS_IN_YEAR = 364;

export interface ComparableAuction {
  issueCode: string;
  auctionDate: string;
  /** Years left to run AT THE AUCTION, not the tenor in the code. */
  yearsToMaturity: number;
  clearingRate: number;
  taxExempt: boolean;
}

export interface BidGuidance {
  /** Remaining term the reader is bidding on. */
  targetYears: number;
  /** How wide a band of remaining term was accepted as comparable. */
  toleranceYears: number;
  /**
   * How far back comparables were drawn, in days; null when the whole archive
   * since GUIDANCE_FROM was needed. Reported because a range built from the
   * last six months and one built from four years are different claims.
   */
  windowDays: number | null;
  comparables: ComparableAuction[];
  /** Sorted clearing rates, for the distribution below. */
  count: number;
  low: number;
  p25: number;
  median: number;
  p75: number;
  high: number;
  /** The most recent comparable auction — what the market last actually did. */
  latest: ComparableAuction | null;
  /** True when there are too few comparables to talk about a range. */
  thin: boolean;
  /** Records in range that had to be dropped for want of a usable figure. */
  droppedForMissingData: number;
}

/** Years still to run on a bond at a given date. Negative once matured. */
export function yearsToMaturityAt(bond: Pick<Bond, 'maturityDate'>, on: Date): number {
  return (new Date(bond.maturityDate).getTime() - on.getTime()) / 86_400_000 / DAYS_IN_YEAR;
}

const quantile = (sorted: number[], q: number): number => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/**
 * Every past auction of paper with a comparable remaining term.
 *
 * `bonds` is needed because the archive records an issue code, not a maturity —
 * and the maturity is the whole point. Records that cannot be matched to a bond
 * we hold are dropped rather than guessed at; on the live data that is about
 * one record in seven, and they are counted so the reader can see it.
 */
export function findComparables(
  prints: AuctionPrint[],
  bonds: Bond[],
  targetYears: number,
  toleranceYears: number,
  taxExempt?: boolean
): { comparables: ComparableAuction[]; dropped: number } {
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  const comparables: ComparableAuction[] = [];
  let dropped = 0;

  for (const p of prints) {
    if (!p.auctionDate || p.auctionDate < GUIDANCE_FROM) continue;
    const bond = byCode.get(normaliseCode(p.issueCode));
    const rate = clearingRate(p);
    if (!bond || rate === null) { dropped++; continue; }

    const ytm = yearsToMaturityAt(bond, new Date(p.auctionDate));
    if (Math.abs(ytm - targetYears) > toleranceYears) continue;
    // Tax status changes the rate a bond clears at, so an IFB is not
    // comparable to an FXD however close their maturities are.
    if (taxExempt !== undefined && bond.taxExempt !== taxExempt) continue;

    comparables.push({
      issueCode: p.issueCode,
      auctionDate: p.auctionDate,
      yearsToMaturity: ytm,
      clearingRate: rate,
      taxExempt: bond.taxExempt,
    });
  }
  comparables.sort((a, b) => b.auctionDate.localeCompare(a.auctionDate));
  return { comparables, dropped };
}

/**
 * How far back to look for comparables, tried nearest-first.
 *
 * RECENT PAPER IS BETTER EVIDENCE, MEASURED
 *
 * Kenyan rates moved 16.7% to 7.4% and back to 8.3% inside two years, so a
 * four-year comparable set is partly evidence from a market that no longer
 * exists. Replayed like-for-like over the archive, preferring recent
 * comparables cut the midpoint's median absolute error from 0.644pp to
 * 0.616pp.
 *
 * THE GAIN IS MODEST, AND A FIRST MEASUREMENT SAID OTHERWISE
 *
 * A cruder experiment suggested a third better (0.978pp to 0.651pp). It was
 * comparing against a differently-constructed baseline, not against this code
 * with the window removed, and the improvement did not survive a like-for-like
 * replay. Four per cent is the honest number.
 *
 * The sample bar for accepting a window is MIN_SAMPLE, deliberately not a
 * tuned one. Sweeping it gave 0.616 at 5, 0.580 at 8, 0.620 at 12 and 0.644 at
 * 15 — non-monotonic on 162 observations, which is the shape of noise rather
 * than of a real optimum. Picking the argmin would be fitting this constant to
 * this archive.
 *
 * IT IS A LADDER, NOT A CUT-OFF
 *
 * A hard 180-day filter would stop answering for tenors that are simply not
 * auctioned often — the two-year's most recent print in this archive is from
 * 2024. Falling back through wider windows keeps those quotable, and it costs
 * nothing measurably: 162 quotable auctions with 24 thin, identical to no
 * window at all.
 *
 * What this does NOT fix is the width of the interval. That was tested
 * separately and recency barely moved it — see lib/calibration.ts, which is
 * where the range itself comes from now.
 */
const RECENCY_LADDER: (number | null)[] = [180, 365, 730, null];

const withinWindow = (
  prints: AuctionPrint[],
  asOf: Date,
  windowDays: number | null
): AuctionPrint[] => {
  if (windowDays === null) return prints;
  const cut = new Date(asOf.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  return prints.filter((p) => p.auctionDate >= cut);
};

/**
 * Build the distribution a bidder should be looking at.
 *
 * Two things widen automatically when the sample is too thin to say anything
 * with: how far back we look, and how different the paper may be. Recency is
 * relaxed FIRST because it costs less — comparing against six-month-old paper
 * of the right term beats comparing against four-year-old paper of the wrong
 * one. Both are reported so the reader knows how loose the comparison got.
 */
export function bidGuidance(
  prints: AuctionPrint[],
  bonds: Bond[],
  targetYears: number,
  opts: { taxExempt?: boolean; tolerance?: number; asOf?: Date } = {}
): BidGuidance {
  /* Point-in-time by construction: the window is measured back from the newest
   * print supplied, never from the clock. The backtest hands us only prints
   * from before the auction being replayed, and reading the real date here
   * would silently let a replay of 2023 use a 2026 window. */
  const newest = prints.reduce<string>(
    (max, p) => (p.auctionDate && p.auctionDate > max ? p.auctionDate : max),
    '0000-00-00'
  );
  const asOf = opts.asOf ?? (newest > '0000-00-00' ? new Date(newest) : new Date(0));

  let tolerance = opts.tolerance ?? 1.5;
  let windowDays: number | null = RECENCY_LADDER[0];
  let found = findComparables(
    withinWindow(prints, asOf, windowDays),
    bonds,
    targetYears,
    tolerance,
    opts.taxExempt
  );

  // Look further back before accepting less similar paper.
  for (const wider of RECENCY_LADDER.slice(1)) {
    if (found.comparables.length >= MIN_SAMPLE) break;
    windowDays = wider;
    found = findComparables(
      withinWindow(prints, asOf, windowDays),
      bonds,
      targetYears,
      tolerance,
      opts.taxExempt
    );
  }

  // Only then widen what counts as comparable, across the full archive.
  for (const wider of [3, 5]) {
    if (found.comparables.length >= MIN_SAMPLE) break;
    tolerance = wider;
    windowDays = null;
    found = findComparables(prints, bonds, targetYears, tolerance, opts.taxExempt);
  }

  const rates = found.comparables.map((c) => c.clearingRate).sort((a, b) => a - b);
  return {
    targetYears,
    toleranceYears: tolerance,
    windowDays,
    comparables: found.comparables,
    count: rates.length,
    low: rates[0] ?? 0,
    p25: quantile(rates, 0.25),
    median: quantile(rates, 0.5),
    p75: quantile(rates, 0.75),
    high: rates[rates.length - 1] ?? 0,
    latest: found.comparables[0] ?? null,
    thin: rates.length < MIN_SAMPLE,
    droppedForMissingData: found.dropped,
  };
}

/* ------------------------------------------------------- reading your bid */

export type BidVerdict = 'aggressive' | 'competitive' | 'generous' | 'unknown';

export interface BidPosition {
  verdict: BidVerdict;
  /** Share of past comparable auctions that cleared BELOW the reader's rate. */
  percentile: number;
  headline: string;
  detail: string;
}

/**
 * Where a proposed rate sits against history.
 *
 * The direction matters and is easy to get backwards. In a CBK bond auction
 * the bidder names a RATE, and the Treasury fills the cheapest money first —
 * so a LOW rate is the aggressive bid that risks rejection, and a HIGH rate is
 * the generous one that is likely filled but leaves yield on the table for
 * nobody's benefit but the borrower's.
 */
export function readBid(rate: number, g: BidGuidance): BidPosition {
  if (g.thin) {
    return {
      verdict: 'unknown',
      percentile: 0,
      headline: 'Not enough comparable auctions to judge this.',
      detail: `Only ${g.count} auction${g.count === 1 ? '' : 's'} of similar paper since ${GUIDANCE_FROM}. `
        + 'Treat any range from so few results as an anecdote, not a guide.',
    };
  }

  const below = g.comparables.filter((c) => c.clearingRate < rate).length;
  const percentile = (below / g.count) * 100;

  if (rate < g.p25) {
    return {
      verdict: 'aggressive',
      percentile,
      headline: `Below where ${(100 - percentile).toFixed(0)}% of comparable auctions cleared.`,
      detail: `Only ${percentile.toFixed(0)}% of similar auctions since ${GUIDANCE_FROM} settled under `
        + `${rate.toFixed(3)}%. A rate this low is often rejected outright — CBK fills the cheapest `
        + 'money first and stops when the offer is covered.',
    };
  }
  if (rate > g.p75) {
    return {
      verdict: 'generous',
      percentile,
      headline: `Above where ${percentile.toFixed(0)}% of comparable auctions cleared.`,
      detail: `Likely to be filled, but you are asking for more than the market has recently needed `
        + `to pay. The middle of the range is ${g.median.toFixed(3)}%; the difference is yield the `
        + 'Treasury would have given you anyway.',
    };
  }
  return {
    verdict: 'competitive',
    percentile,
    headline: `In the middle of the range — ${percentile.toFixed(0)}% of comparable auctions cleared below this.`,
    detail: `Comparable paper has settled between ${g.p25.toFixed(3)}% and ${g.p75.toFixed(3)}% since `
      + `${GUIDANCE_FROM}. A bid here is in the band the market has actually been clearing at.`,
  };
}

/* --------------------------------------------------------------- demand */

export interface AuctionDemand {
  auctionDate: string;
  offeredKESM: number;
  bidsKESM: number;
  acceptedKESM: number;
  /** Bids received divided by the amount offered, for the WHOLE auction. */
  coverRatio: number;
  /** Share of bids CBK actually took. Low means they rejected expensive money. */
  acceptanceRate: number;
}

/**
 * Demand, computed per auction rather than per bond.
 *
 * This is the trap documented at the top of the file. `amountOfferedKESM` is
 * the whole auction's offer repeated on each of its bonds, so a per-row ratio
 * divides one bond's bids by every bond's target. Grouping first is not a
 * refinement, it is the difference between 1.20x and 0.61x — between a market
 * that is modestly oversubscribed and one that looks to be failing.
 */
export function demandByAuction(prints: AuctionPrint[], from = GUIDANCE_FROM): AuctionDemand[] {
  const byDate = new Map<string, AuctionPrint[]>();
  for (const p of prints) {
    if (!p.auctionDate || p.auctionDate < from) continue;
    const list = byDate.get(p.auctionDate) ?? [];
    list.push(p);
    byDate.set(p.auctionDate, list);
  }

  const out: AuctionDemand[] = [];
  byDate.forEach((group, date) => {
    // Every bond in one auction repeats the same offered figure; take it once.
    const offered = Array.from(
      new Set(group.map((p) => p.amountOfferedKESM).filter((v): v is number => typeof v === 'number'))
    );
    if (offered.length !== 1 || !offered[0]) return;
    const bids = group.map((p) => p.bidsReceivedKESM);
    const accepted = group.map((p) => p.amountAcceptedKESM);
    if (bids.some((v) => typeof v !== 'number') || accepted.some((v) => typeof v !== 'number')) return;

    const bidsKESM = (bids as number[]).reduce((s, v) => s + v, 0);
    const acceptedKESM = (accepted as number[]).reduce((s, v) => s + v, 0);
    out.push({
      auctionDate: date,
      offeredKESM: offered[0],
      bidsKESM,
      acceptedKESM,
      coverRatio: bidsKESM / offered[0],
      acceptanceRate: bidsKESM > 0 ? acceptedKESM / bidsKESM : 0,
    });
  });
  return out.sort((a, b) => b.auctionDate.localeCompare(a.auctionDate));
}

/** One line on how hungry the market has been lately. */
export function describeDemand(demand: AuctionDemand[], lastN = 6): string | null {
  const recent = demand.slice(0, lastN);
  if (recent.length < 3) return null;
  const covers = recent.map((d) => d.coverRatio).sort((a, b) => a - b);
  const median = quantile(covers, 0.5);
  const shape = median >= 1.5 ? 'comfortably oversubscribed'
    : median >= 1 ? 'modestly oversubscribed'
    : 'undersubscribed';
  return `The last ${recent.length} auctions were ${shape} — bids covered `
    + `${median.toFixed(2)}x the amount offered, at the middle of that run. `
    + 'Heavy demand lets CBK reject expensive bids, so a low rate is riskier when cover is high.';
}
