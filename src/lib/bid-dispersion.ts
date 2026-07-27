import type { AuctionPrint } from '../types/bond';
import { auctionKind } from './auction-history';

/**
 * How far apart the bidders were, and what it cost the ones who overreached.
 *
 * CBK publishes two averages per auction: across ALL bids, and across the
 * accepted ones. The gap between them is not a rounding difference. It is the
 * distance between what bidders collectively asked for and what the Treasury
 * was willing to pay, measured in basis points:
 *
 *     dispersion = market weighted average − accepted weighted average
 *
 * A NARROW gap means bids clustered and almost everything was taken. A WIDE one
 * means a tail of bidders asked for materially more than the Treasury would pay
 * and were refused. Neither is visible in a clearing rate, and the reader this
 * matters most to is the one deciding what to ask for.
 *
 * WHY THIS COULD NOT BE BUILT UNTIL NOW
 * ------------------------------------
 * Until today's parser fix both fields held the SAME number in every record
 * that carried them — "Market Weighted Average Rate" contains "Weighted Average
 * Rate", so the first pattern captured the market row and the accepted row was
 * never read. The measurement was identically zero, 244 times, and looked like
 * a market with no dispersion at all.
 *
 * WHAT THE CORRECTED ARCHIVE SAYS
 * -------------------------------
 * Across 240 sales the gap is never negative — not once. The Treasury accepts
 * the lowest yields, so the accepted average cannot sit above the all-bids
 * average, and the data obeys that without being told to. That is a stronger
 * check on the fix than any fixture: an arithmetic identity the corrected
 * numbers satisfy and the old ones could not have.
 *
 * The median is about 10bp today. It was 181bp in 2011 and 96bp in 2012, when
 * rates were violent and bidders disagreed; it fell under 7bp through the
 * placid 2019-2022 stretch and widened again to 16bp in 2023-24.
 *
 * BUYBACKS ARE EXCLUDED, and for the reason auction-history documents: the
 * Treasury is the buyer there, so the sign flips and a "dispersion" computed
 * across it means the opposite of what it means everywhere else.
 */

export interface DispersionPoint {
  auctionDate: string;
  issueCode: string;
  /** Basis points between the all-bids average and the accepted average. */
  spreadBps: number;
}

export interface DispersionSummary {
  points: DispersionPoint[];
  recentMedianBps: number;
  allTimeMedianBps: number;
  /** Auctions where every bid was taken at the same average — no tail refused. */
  tightAuctions: number;
  sampleSize: number;
}

/** Below this a median describes which auctions parsed, not the market. */
export const MIN_AUCTIONS_FOR_DISPERSION = 8;

/** The recent window, in auctions. */
export const DISPERSION_WINDOW = 24;

/** A gap this small means the bids agreed; anything less is noise in a rounded figure. */
export const TIGHT_BPS = 1;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function dispersionPoints(prints: AuctionPrint[]): DispersionPoint[] {
  const out: DispersionPoint[] = [];
  for (const p of prints) {
    if (!p.auctionDate || !p.issueCode) continue;
    if (auctionKind(p) === 'buyback') continue;
    const accepted = p.weightedAverageRate;
    const market = p.marketWeightedAverageRate;
    if (accepted == null || market == null) continue;
    out.push({
      auctionDate: p.auctionDate,
      issueCode: p.issueCode,
      spreadBps: (market - accepted) * 100,
    });
  }
  return out.sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
}

export function dispersionSummary(
  prints: AuctionPrint[],
  window: number = DISPERSION_WINDOW
): DispersionSummary | null {
  const points = dispersionPoints(prints);
  if (points.length < MIN_AUCTIONS_FOR_DISPERSION) return null;
  const recent = points.slice(-window);
  return {
    points: recent,
    recentMedianBps: median(recent.map((p) => p.spreadBps)),
    allTimeMedianBps: median(points.map((p) => p.spreadBps)),
    tightAuctions: recent.filter((p) => p.spreadBps < TIGHT_BPS).length,
    sampleSize: points.length,
  };
}
