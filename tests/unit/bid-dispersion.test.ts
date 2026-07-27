import { describe, it, expect } from 'vitest';
import auctionsData from '../../public/data/auction-results.json';
import type { AuctionPrint } from '../../src/types/bond';
import {
  dispersionPoints,
  dispersionSummary,
  MIN_AUCTIONS_FOR_DISPERSION,
} from '../../src/lib/bid-dispersion';

const PRINTS = auctionsData as unknown as AuctionPrint[];

function print(over: Partial<AuctionPrint>): AuctionPrint {
  return {
    id: 'x',
    issueCode: 'FXD1/2022/010',
    auctionDate: '2026-01-05',
    ...over,
  } as AuctionPrint;
}

describe('the measurement', () => {
  it('is the gap between what was asked and what was paid', () => {
    const [p] = dispersionPoints([
      print({ weightedAverageRate: 13.471, marketWeightedAverageRate: 13.839 }),
    ]);
    expect(p.spreadBps).toBeCloseTo(36.8, 1);
  });

  it('says nothing when only one of the two rates was published', () => {
    expect(dispersionPoints([print({ weightedAverageRate: 13.471 })])).toEqual([]);
    expect(dispersionPoints([print({ marketWeightedAverageRate: 13.839 })])).toEqual([]);
  });

  /**
   * A buyback's sign is reversed — the Treasury is the buyer and accepts the
   * HIGHEST yields, so the gap runs the other way and means the opposite. One
   * of these in the series would show as a negative "dispersion" and read as
   * bidders being paid more than they asked.
   */
  it('excludes buybacks, where the sign is reversed', () => {
    const buyback = print({
      weightedAverageRate: 9.0676,
      marketWeightedAverageRate: 8.922,
      sourceUrl: 'https://x/FEBRUARY BUYBACK AUCTION FXD1-2022-003 DATED 17-02-2025.pdf',
    });
    expect(dispersionPoints([buyback])).toEqual([]);
  });

  it('returns points oldest first', () => {
    const pts = dispersionPoints([
      print({ auctionDate: '2026-03-01', weightedAverageRate: 13, marketWeightedAverageRate: 13.1 }),
      print({ auctionDate: '2026-01-01', weightedAverageRate: 12, marketWeightedAverageRate: 12.1 }),
    ]);
    expect(pts.map((p) => p.auctionDate)).toEqual(['2026-01-01', '2026-03-01']);
  });
});

describe('measured on the shipped archive', () => {
  const pts = dispersionPoints(PRINTS);

  it('has enough sales carrying both rates to say anything', () => {
    expect(pts.length).toBeGreaterThan(150);
  });

  /**
   * THE CHECK THAT MATTERS, and it is an arithmetic identity rather than a
   * convention.
   *
   * In a sale the Treasury accepts the lowest yields, because a low yield is
   * cheap borrowing. So the average across ACCEPTED bids cannot sit above the
   * average across ALL bids, and this gap cannot be negative. Ever.
   *
   * Before today's parser fix both fields held the same number and every gap
   * was exactly zero — this test would have passed while measuring nothing.
   * It is meaningful now precisely because the values differ: 240 sales, not
   * one negative. The corrected data satisfies a constraint it was never told
   * about, which is stronger evidence for the fix than any fixture.
   *
   * A negative here means either the two rates are crossed again or a
   * non-sale has entered the series.
   */
  it('never reports a negative gap, which a sale cannot produce', () => {
    for (const p of pts) {
      expect(
        p.spreadBps,
        `${p.issueCode} on ${p.auctionDate}: accepted bids averaged ABOVE all bids, ` +
          `which a sale cannot do — the rates are crossed or this is not a sale`
      ).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * And the other half of the same guard: the values must not all be zero.
   *
   * That is exactly what the archive looked like this morning. Without this,
   * a regression that re-crossed the two fields would leave every assertion
   * above passing on a column of zeroes.
   */
  it('is measuring a real spread, not a column of zeroes', () => {
    const nonZero = pts.filter((p) => p.spreadBps > 0).length;
    expect(
      nonZero / pts.length,
      'nearly every gap is zero — the two rate fields have collapsed onto one value again'
    ).toBeGreaterThan(0.9);
  });

  it('summarises with both windows, or says nothing at all', () => {
    const s = dispersionSummary(PRINTS);
    expect(s).not.toBeNull();
    expect(s!.recentMedianBps).toBeGreaterThan(0);
    expect(s!.allTimeMedianBps).toBeGreaterThan(0);
    expect(s!.sampleSize).toBe(pts.length);
    expect(dispersionSummary(PRINTS.slice(0, MIN_AUCTIONS_FOR_DISPERSION - 1))).toBeNull();
  });
});
