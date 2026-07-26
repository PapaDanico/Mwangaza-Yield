// The price book — where a number the reader found becomes a number the app plans on.
//
// Every yield in this application is a function of price, and we hold no market
// prices at all. This app is built on public CBK, National Treasury and KNBS
// data; exchange price data is licensed and we take none of it, so
// `secondary.json` is empty and each planner used to fall back silently to par
// 100. That fallback is not neutral: a bond trading at 92 shows a materially
// lower yield at 100, and the reader had no way to tell a real price from a
// placeholder.
//
// The price a reader actually pays is theirs, not ours to source. So they
// record it — the price paid, or the one a broker or DhowCSD quotes — it stays
// on their own device exactly as holdings do, and, the part that matters, the
// PROVENANCE travels with the value so no figure in this app can present a
// placeholder as though it were the market.

import type { Bond, SecondaryTrade } from '../types/bond';

/** A price the reader looked up and recorded. Never leaves their device. */
export interface UserPrice {
  isin: string;
  /** Clean price per 100 face. */
  price: number;
  /** ISO date the reader observed it — not the date they typed it in. */
  observedOn: string;
  /** Free text: "my broker's quote", "price I paid". Optional, for recall. */
  note?: string;
  updatedAt: string;
}

export type PriceSource = 'user' | 'market' | 'par';

export interface ResolvedPrice {
  price: number;
  source: PriceSource;
  /** ISO date the price refers to; null when it is the par placeholder. */
  asOfDate: string | null;
  /** Whole days between `asOfDate` and the valuation date. null for par. */
  ageDays: number | null;
  /** True when the price is old enough that we should say so out loud. */
  stale: boolean;
  note?: string;
}

/**
 * Beyond this, a recorded price stops being "what it trades at" and becomes
 * "what it traded at once". Kenyan retail paper is thin — a fortnight can pass
 * with no print at all — so a week would cry wolf and a quarter would let a
 * pre-MPC price survive a rate decision. Thirty days spans one coupon-free
 * stretch and at most one policy meeting.
 */
export const STALE_AFTER_DAYS = 30;

/** Prices outside this band are almost certainly a typo, not a quote. */
export const MIN_PRICE = 40;
export const MAX_PRICE = 160;

const DAY_MS = 86_400_000;

function daysBetween(fromISO: string, to: Date): number | null {
  const from = new Date(fromISO);
  if (Number.isNaN(from.getTime())) return null;
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Resolve one bond's price, most trustworthy source first.
 *
 * The reader's own price outranks a supplied feed deliberately. If someone has
 * been quoted 96.40 and typed it in, that is a better
 * description of what they would actually pay than a print we hold from an
 * earlier session. They looked; we only remembered.
 */
export function resolvePrice(
  bond: Pick<Bond, 'isin'>,
  secondary: SecondaryTrade[] = [],
  userPrices: UserPrice[] = [],
  asOf: Date = new Date()
): ResolvedPrice {
  const mine = userPrices.find((p) => p.isin === bond.isin);
  if (mine && isPlausiblePrice(mine.price)) {
    const ageDays = daysBetween(mine.observedOn, asOf);
    return {
      price: mine.price,
      source: 'user',
      asOfDate: mine.observedOn,
      ageDays,
      stale: ageDays !== null && ageDays > STALE_AFTER_DAYS,
      note: mine.note,
    };
  }

  // Several prints for one ISIN: take the most recent, not the first found.
  const trades = secondary.filter((t) => t.isin === bond.isin);
  if (trades.length) {
    const latest = trades.reduce((a, b) => (a.tradeDate >= b.tradeDate ? a : b));
    const ageDays = daysBetween(latest.tradeDate, asOf);
    return {
      price: latest.price,
      source: 'market',
      asOfDate: latest.tradeDate,
      ageDays,
      stale: ageDays !== null && ageDays > STALE_AFTER_DAYS,
    };
  }

  return { price: 100, source: 'par', asOfDate: null, ageDays: null, stale: false };
}

/**
 * A resolver bound to one dataset, for the hot paths that price a whole
 * universe of bonds in a loop (ladder construction, goal planning). Memoised
 * per ISIN because `buildLadder` prices the same candidate several times as it
 * ranks, buckets and backfills, and the goal planners call it again per bond.
 */
export function makePriceResolver(
  secondary: SecondaryTrade[] = [],
  userPrices: UserPrice[] = [],
  asOf: Date = new Date()
): (bond: Pick<Bond, 'isin'>) => ResolvedPrice {
  const cache = new Map<string, ResolvedPrice>();
  return (bond) => {
    const hit = cache.get(bond.isin);
    if (hit) return hit;
    const resolved = resolvePrice(bond, secondary, userPrices, asOf);
    cache.set(bond.isin, resolved);
    return resolved;
  };
}

export function isPlausiblePrice(price: number): boolean {
  return Number.isFinite(price) && price >= MIN_PRICE && price <= MAX_PRICE;
}

/**
 * Why a plan's numbers can be trusted, or can't — one line, in the reader's
 * words rather than ours. Used wherever a whole plan is summarised, so the
 * caveat travels with the figure instead of living in a footnote.
 */
export function describeProvenance(resolved: ResolvedPrice): string {
  switch (resolved.source) {
    case 'user':
      return resolved.stale
        ? `Your price of ${resolved.price.toFixed(2)}, recorded ${resolved.ageDays} days ago — worth checking again.`
        : `Your price of ${resolved.price.toFixed(2)} from ${resolved.asOfDate}.`;
    case 'market':
      return `Last traded at ${resolved.price.toFixed(2)} on ${resolved.asOfDate}.`;
    case 'par':
      return 'Priced at par 100 — a placeholder, not the market. Add the price you would pay.';
  }
}

/**
 * How much of a plan rests on real prices. A plan built entirely on par is
 * arithmetic about a market that does not exist, and the reader deserves to be
 * told that in one glance rather than by auditing each rung.
 */
export interface PriceCoverage {
  total: number;
  priced: number;      // user or market
  parFallback: number;
  staleCount: number;
  /** 0–1. 1 means every bond in the plan has a real price behind it. */
  ratio: number;
}

export function summarisePriceCoverage(resolved: ResolvedPrice[]): PriceCoverage {
  const total = resolved.length;
  const parFallback = resolved.filter((r) => r.source === 'par').length;
  const priced = total - parFallback;
  return {
    total,
    priced,
    parFallback,
    staleCount: resolved.filter((r) => r.stale).length,
    ratio: total === 0 ? 0 : priced / total,
  };
}
