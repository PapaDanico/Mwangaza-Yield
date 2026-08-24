/**
 * Is the price you were quoted a good one?
 *
 * The app answers "what does this bond pay?" and, since the auction radar,
 * "what should I bid at a primary auction?". It has never answered the
 * question a person actually holds in their hand: a broker has quoted them a
 * price for a specific bond, and they have no idea whether it is generous,
 * ordinary or poor. There is no published Kenyan secondary benchmark to check
 * it against, and this project deliberately holds no exchange prices.
 *
 * What it does hold is every auction CBK has settled. So: solve the yield the
 * quoted price implies, and set it beside what comparable paper has actually
 * cleared at in the primary market lately. That does not make the quote right
 * or wrong — but "you are being offered 80 basis points less than the
 * government has been paying for the same risk over the same horizon" is a
 * fact a person can act on, and nothing else in the product tells them.
 *
 * FOUR THINGS THAT MUST MATCH, OR THE COMPARISON IS NOISE
 * ------------------------------------------------------
 * 1. GROSS against GROSS. Clearing rates are pre-tax. Comparing them to a net
 *    yield understates the quote by the whole withholding tax — the same
 *    apples-to-oranges error that had a sister product overstating a T-bill
 *    ladder by three quarters of a point.
 * 2. TAX STATUS. Investors accept a lower gross yield on an infrastructure
 *    bond because the coupon is untaxed. Benchmarking an IFB against a pool
 *    containing FXDs makes every IFB look like a bargain. Measured on the
 *    live archive, an IFB priced at par reads +509bps against a blended
 *    pool — an artefact, not an opportunity.
 * 3. REMAINING TERM, not the tenor label. Re-openings keep their original
 *    code for life; see bid.ts for the full account of that trap.
 * 4. RECENCY. Rates have moved a long way: the same 7–12 year band medians
 *    12.78% over the last year and 13.67% over two. A benchmark built on the
 *    2024 peak would call today's market cheap for reasons that are purely
 *    calendar.
 *
 * WHAT IT REFUSES
 * ---------------
 * All four constraints at once are expensive. On the shipped archive this can
 * benchmark 29 of the 58 outstanding bonds; the rest have too few comparable
 * recent auctions and get no verdict at all. CBK simply has not auctioned many
 * infrastructure bonds lately, and almost nothing with under three years left
 * to run. Saying nothing is the honest outcome there — a median of two prints
 * dressed up as a market level would be worse than silence.
 */

import type { AuctionPrint, Bond } from '../types/bond';
import { normaliseCode, clearingRate, auctionKind } from './auction-history';
import { computeBondInvestment } from './financial-engine';
import { yearsToMaturityAt } from './bid';

/** Only auctions this recent count. Matches the market-pulse window. */
export const BENCHMARK_WINDOW_DAYS = 365;

/** Below this many comparable auctions, no verdict is offered. */
export const MIN_PEERS = 4;

/** Inside this band the quote is called ordinary rather than rich or cheap. */
export const IN_LINE_BPS = 25;

export type QuoteVerdict = 'above' | 'in-line' | 'below' | 'unknown';

export interface QuoteBenchmark {
  /** Gross yield the quoted price implies, solved from the cash-flow schedule. */
  impliedGrossYTM: number;
  /** Median gross clearing rate of comparable recent auctions. */
  peerMedian: number | null;
  peerLow: number | null;
  peerHigh: number | null;
  peerCount: number;
  /** How far the term band had to widen to find a usable sample. */
  toleranceYears: number;
  /** Implied yield minus peer median, in basis points. Positive = richer. */
  gapBps: number | null;
  verdict: QuoteVerdict;
  /** Years the bond has left to run — what the peers were matched on. */
  yearsRemaining: number;
  /** Plain-language reading, safe to render directly. */
  summary: string;
}

interface Peer {
  years: number;
  rate: number;
  taxExempt: boolean;
}

/** Recent auctions reduced to the three fields a comparison needs. */
function recentPeers(prints: AuctionPrint[], bonds: Bond[], asOf: Date): Peer[] {
  const cutoff = new Date(asOf.getTime() - BENCHMARK_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  const out: Peer[] = [];
  for (const p of prints) {
    if (!p.auctionDate || p.auctionDate < cutoff) continue;
    if (auctionKind(p) !== 'issuance') continue;
    const bond = byCode.get(normaliseCode(p.issueCode));
    const rate = clearingRate(p);
    if (!bond || rate === null) continue;
    out.push({
      years: yearsToMaturityAt(bond, new Date(p.auctionDate)),
      rate,
      taxExempt: bond.taxExempt,
    });
  }
  return out;
}

const median = (sorted: number[]): number => {
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
};

/**
 * Set a quoted price against where comparable paper has recently cleared.
 *
 * `pricePer100` is what the reader was quoted — from their own price book, or
 * typed into the calculator. Everything else is the published archive.
 */
export function benchmarkQuote(
  bond: Bond,
  pricePer100: number,
  prints: AuctionPrint[],
  bonds: Bond[],
  asOf: Date = new Date()
): QuoteBenchmark {
  const result = computeBondInvestment(bond, 100_000, pricePer100, asOf);
  const impliedGrossYTM = result.grossYTM;
  const yearsRemaining = yearsToMaturityAt(bond, asOf);

  const pool = recentPeers(prints, bonds, asOf).filter(
    (p) => p.taxExempt === bond.taxExempt
  );

  // Widen the term band only as far as needed. Stated in the result so a
  // reader can see how loose the comparison had to get to say anything.
  let tolerance = 1.5;
  let peers = pool.filter((p) => Math.abs(p.years - yearsRemaining) <= tolerance);
  for (const wider of [3, 5]) {
    if (peers.length >= MIN_PEERS) break;
    tolerance = wider;
    peers = pool.filter((p) => Math.abs(p.years - yearsRemaining) <= tolerance);
  }

  const kind = bond.taxExempt ? 'tax-free infrastructure bonds' : 'ordinary Treasury bonds';

  if (peers.length < MIN_PEERS) {
    return {
      impliedGrossYTM,
      peerMedian: null,
      peerLow: null,
      peerHigh: null,
      peerCount: peers.length,
      toleranceYears: tolerance,
      gapBps: null,
      verdict: 'unknown',
      yearsRemaining,
      summary:
        `Not enough comparable auctions to judge this quote. CBK has settled only ${peers.length} `
        + `sale${peers.length === 1 ? '' : 's'} of ${kind} with a similar time left to run in the past year, `
        + 'and a level drawn from that few would be an anecdote rather than a market.',
    };
  }

  const rates = peers.map((p) => p.rate).sort((a, b) => a - b);
  const peerMedian = median(rates);
  const gapBps = Math.round((impliedGrossYTM - peerMedian) * 100);

  const verdict: QuoteVerdict =
    Math.abs(gapBps) <= IN_LINE_BPS ? 'in-line' : gapBps > 0 ? 'above' : 'below';

  const term = `${yearsRemaining.toFixed(1)} years`;
  const basis =
    `Compared against ${peers.length} auction${peers.length === 1 ? '' : 's'} of ${kind} `
    + `within ${tolerance} years of ${term} left to run, settled in the past 12 months.`;

  const summary =
    verdict === 'in-line'
      ? `This quote yields about what the government has been paying. ${basis}`
      : verdict === 'above'
        ? `This quote yields ${gapBps} basis points MORE than comparable paper has been clearing at — `
          + `you are being offered more than the government has recently had to pay for the same `
          + `horizon and tax treatment. ${basis}`
        : `This quote yields ${Math.abs(gapBps)} basis points LESS than comparable paper has been `
          + `clearing at. That is not necessarily a bad trade, but you are accepting less than the `
          + `government has recently paid for the same horizon and tax treatment. ${basis}`;

  return {
    impliedGrossYTM,
    peerMedian,
    peerLow: rates[0],
    peerHigh: rates[rates.length - 1],
    peerCount: peers.length,
    toleranceYears: tolerance,
    gapBps,
    verdict,
    yearsRemaining,
    summary,
  };
}
