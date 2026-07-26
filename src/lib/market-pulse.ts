/**
 * The market right now, from auctions alone.
 *
 * The dashboard's yield curve carries a documented weakness: `ytmGross` is as
 * old as the last auction of each bond, and some points are years stale. This
 * module is the honest complement — it says only what RECENT auctions prove,
 * and nothing where they prove nothing:
 *
 *   1. What clearing rates the last twelve months of auctions actually paid,
 *      bucketed by REMAINING TERM at the auction (never the tenor label — 57%
 *      of recent records are mislabelled re-openings, see bid.ts).
 *   2. How hungry the market has been: grouped bid-to-cover and the share of
 *      bids CBK accepted, from demandByAuction (never per record).
 *
 * A bucket below MIN_BUCKET_SAMPLE is reported as having too little evidence
 * rather than being quietly dropped or quietly averaged — the reader should
 * see where the market has simply not sold paper lately.
 */

import type { AuctionPrint, Bond } from '../types/bond';
import { normaliseCode, clearingRate } from './auction-history';
import { demandByAuction, yearsToMaturityAt, type AuctionDemand } from './bid';

/** Only auctions inside this window count as "now". */
export const PULSE_WINDOW_DAYS = 365;

/** Below this many auctions a bucket is evidence-thin and says so. */
export const MIN_BUCKET_SAMPLE = 3;

export interface TermBucket {
  label: string;
  /** Remaining-term band, inclusive of from, exclusive of to. */
  fromYears: number;
  toYears: number;
  count: number;
  median: number | null;
  low: number | null;
  high: number | null;
  /** Most recent auction in the bucket, so staleness is visible. */
  latestDate: string | null;
}

const BANDS: Array<Pick<TermBucket, 'label' | 'fromYears' | 'toYears'>> = [
  { label: 'Under 3y', fromYears: 0, toYears: 3 },
  { label: '3–7y', fromYears: 3, toYears: 7 },
  { label: '7–12y', fromYears: 7, toYears: 12 },
  { label: '12–20y', fromYears: 12, toYears: 20 },
  { label: '20y+', fromYears: 20, toYears: 40 },
];

const median = (sorted: number[]): number => {
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
};

/**
 * Clearing rates from the recent window, by remaining term at auction.
 * Records that cannot be matched to a bond (and so have no maturity) are
 * excluded — a rate we cannot place on the curve is not a curve point.
 */
export function recentClearingByTerm(
  prints: AuctionPrint[],
  bonds: Bond[],
  asOf: Date,
  windowDays = PULSE_WINDOW_DAYS
): TermBucket[] {
  const cutoff = new Date(asOf.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));

  const perBand: number[][] = BANDS.map(() => []);
  const latest: (string | null)[] = BANDS.map(() => null);

  for (const p of prints) {
    if (!p.auctionDate || p.auctionDate < cutoff) continue;
    const bond = byCode.get(normaliseCode(p.issueCode));
    const rate = clearingRate(p);
    if (!bond || rate === null) continue;
    const years = yearsToMaturityAt(bond, new Date(p.auctionDate));
    const i = BANDS.findIndex((b) => years >= b.fromYears && years < b.toYears);
    if (i < 0) continue;
    perBand[i].push(rate);
    if (!latest[i] || p.auctionDate > latest[i]!) latest[i] = p.auctionDate;
  }

  return BANDS.map((b, i) => {
    const rates = perBand[i].sort((a, z) => a - z);
    const enough = rates.length >= MIN_BUCKET_SAMPLE;
    return {
      ...b,
      count: rates.length,
      median: enough ? median(rates) : null,
      low: enough ? rates[0] : null,
      high: enough ? rates[rates.length - 1] : null,
      latestDate: latest[i],
    };
  });
}

export interface DemandPulse {
  auctions: number;
  medianCover: number;
  medianAcceptance: number;
  /** Positive = demand strengthening vs the earlier half of the window. */
  coverTrendPp: number | null;
  latest: AuctionDemand | null;
}

/** Demand over the window, and whether it is strengthening or fading. */
export function demandPulse(
  prints: AuctionPrint[],
  asOf: Date,
  windowDays = PULSE_WINDOW_DAYS
): DemandPulse | null {
  const cutoff = new Date(asOf.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const all = demandByAuction(prints, cutoff); // newest first
  if (all.length < MIN_BUCKET_SAMPLE) return null;

  const covers = all.map((d) => d.coverRatio).sort((a, b) => a - b);
  const accepts = all.map((d) => d.acceptanceRate).sort((a, b) => a - b);

  // Trend needs both halves populated; below 6 auctions call it unknown
  // rather than reading direction from two-and-two.
  let trend: number | null = null;
  if (all.length >= 6) {
    const half = Math.floor(all.length / 2);
    const recent = all.slice(0, half).map((d) => d.coverRatio).sort((a, b) => a - b);
    const earlier = all.slice(half).map((d) => d.coverRatio).sort((a, b) => a - b);
    trend = median(recent) - median(earlier);
  }

  return {
    auctions: all.length,
    medianCover: median(covers),
    medianAcceptance: median(accepts),
    coverTrendPp: trend,
    latest: all[0] ?? null,
  };
}
