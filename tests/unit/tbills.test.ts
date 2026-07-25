import { describe, it, expect } from 'vitest';
import { computeTBill, tbillPricePer100, projectRollover, bestTBill, TBILL_WHT_RATE } from '../../src/lib/tbills';
import type { TBill } from '../../src/types/bond';

// Reference case: the 16 Jul 2026 CBK auction, 91-day at 8.7986%.
const R91 = computeTBill(100_000, 8.7986, 91);

describe('tbillPricePer100', () => {
  it('discounts on a 365-day basis', () => {
    // 8.7986 x 91/365 = 2.1936 discount per 100
    expect(tbillPricePer100(8.7986, 91)).toBeCloseTo(97.8064, 3);
  });
  it('a full-year bill discounts by almost the whole rate', () => {
    expect(tbillPricePer100(9.0415, 364)).toBeCloseTo(100 - 9.0415 * (364 / 365), 4);
  });
});

describe('computeTBill', () => {
  it('cost is face less the discount', () => {
    expect(R91.costKES).toBeCloseTo(97_806.4, 0);
    expect(R91.grossInterestKES).toBeCloseTo(2_193.6, 0);
    expect(R91.costKES + R91.grossInterestKES).toBeCloseTo(100_000, 6);
  });

  it('applies 15% WHT to the interest, never the principal', () => {
    expect(R91.whtKES).toBeCloseTo(R91.grossInterestKES * TBILL_WHT_RATE, 6);
    expect(R91.netProceedsKES).toBeCloseTo(R91.costKES + R91.netInterestKES, 6);
    expect(R91.netProceedsKES).toBeLessThan(100_000);
  });

  it('effective yield EXCEEDS the quoted discount rate — the headline gap', () => {
    expect(R91.grossEAY).toBeGreaterThan(8.7986);
    expect(R91.grossEAY).toBeCloseTo(9.31, 1);
    expect(R91.quoteGapBps).toBeGreaterThan(0);
  });

  it('net yield falls below the quoted rate once WHT bites', () => {
    expect(R91.netEAY).toBeLessThan(8.7986);
    expect(R91.netEAY).toBeCloseTo(7.87, 1);
    expect(R91.taxDragBps).toBeGreaterThan(100);
  });

  it('the quote-to-yield gap WIDENS with tenor', () => {
    // Counter-intuitive but correct: a 364-day bill prices near 91 while a
    // 91-day prices near 98, so the same discount is earned on a much smaller
    // outlay. That price-base effect outweighs the loss of compounding.
    const r364 = computeTBill(100_000, 9.0415, 364);
    expect(r364.pricePer100).toBeLessThan(R91.pricePer100);
    expect(r364.quoteGapBps).toBeGreaterThan(R91.quoteGapBps);
    expect(r364.grossEAY).toBeCloseTo(9.94, 1);
  });
});

describe('projectRollover', () => {
  it('rolls a 91-day bill four times in a year and compounds', () => {
    const p = projectRollover(1_000_000, 8.7986, 91, 12);
    expect(p.cycles).toBe(4);
    expect(p.schedule).toHaveLength(4);
    expect(p.finalValueKES).toBeGreaterThan(1_000_000);
    // Each cycle starts from the previous cycle's net proceeds.
    expect(p.schedule[1].startKES).toBeCloseTo(p.schedule[0].endKES, 6);
    expect(p.netAnnualisedYield).toBeCloseTo(computeTBill(100_000, 8.7986, 91).netEAY, 1);
  });

  it('never returns zero cycles for a short horizon', () => {
    expect(projectRollover(500_000, 9.0415, 364, 3).cycles).toBe(1);
  });
});

describe('bestTBill', () => {
  const bills: TBill[] = [
    { id: 'a', tenorDays: 91, discountRate: 8.7986, auctionDate: '2026-07-16', nextAuctionDate: '2026-07-30', amountOfferedKES: 0, amountAcceptedKES: 0, minInvestmentKES: 100_000, source: 'x' },
    { id: 'b', tenorDays: 364, discountRate: 9.0415, auctionDate: '2026-07-16', nextAuctionDate: '2026-07-30', amountOfferedKES: 0, amountAcceptedKES: 0, minInvestmentKES: 100_000, source: 'x' },
  ];
  it('ranks by net effective yield, not the quoted rate', () => {
    const best = bestTBill(bills)!;
    expect(best.result.netEAY).toBeGreaterThanOrEqual(
      computeTBill(100_000, 9.0415, 364).netEAY
    );
  });
  it('returns null with no bills', () => expect(bestTBill([])).toBeNull());
});

describe('a yield is a rate, not an amount', () => {
  it('survives an empty amount box', () => {
    // Number('') is 0, which the number input invites on every clear. Deriving
    // the yields from costKES made that 0/0 and put "NaN%" on the page as the
    // headline "what you actually earn" figure.
    const r = computeTBill(0, 9.5, 91);
    expect(Number.isFinite(r.grossEAY)).toBe(true);
    expect(Number.isFinite(r.netEAY)).toBe(true);
    expect(Number.isFinite(r.taxDragBps)).toBe(true);
    expect(Number.isFinite(r.quoteGapBps)).toBe(true);
    expect(r.netEAY).toBeGreaterThan(0);
  });

  it('reports the same yield whatever the amount', () => {
    const small = computeTBill(1, 9.5, 91);
    const large = computeTBill(50_000_000, 9.5, 91);
    expect(small.grossEAY).toBeCloseTo(large.grossEAY, 10);
    expect(small.netEAY).toBeCloseTo(large.netEAY, 10);
  });

  it('still nets below gross, and both above the quoted rate', () => {
    const r = computeTBill(1_000_000, 9.5, 364);
    expect(r.netEAY).toBeLessThan(r.grossEAY);
    expect(r.grossEAY).toBeGreaterThan(r.discountRate);
  });
});
