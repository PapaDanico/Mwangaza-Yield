import { describe, expect, it } from 'vitest';
import { cpiChange, latestBondAuction, tbillChange } from '../../src/lib/week-changes';
import type { AuctionPrint, TBill } from '../../src/types/bond';
import type { CpiPoint } from '../../src/lib/db';

const bill = (tenorDays: 91 | 182 | 364, discountRate: number, previousDiscountRate?: number | null): TBill => ({
  id: `tb-${tenorDays}`, tenorDays, discountRate, auctionDate: '2026-09-24', nextAuctionDate: '2026-10-01',
  amountOfferedKES: null, amountAcceptedKES: null, minInvestmentKES: 100000, source: 'x', previousDiscountRate,
});

describe('week changes', () => {
  it('reports each tenor move in basis points', () => {
    const c = tbillChange([bill(182, 8.8949, 8.9099), bill(91, 8.7781, 8.7837), bill(364, 9.0431, 9.0566)]);
    expect(c?.value).toBe('8.78% / 8.89% / 9.04%');
    expect(c?.change).toBe('down 0.6 / 1.5 / 1.3 bp');
    expect(c?.direction).toBe('down');
  });

  it('shows no change, never a change from zero, when a previous rate is missing', () => {
    const c = tbillChange([bill(91, 8.78, null), bill(182, 8.89, 8.9)]);
    expect(c?.change).toBeNull();
    expect(c?.direction).toBeNull();
  });

  it('names every bond sold on the latest auction day', () => {
    const p = (issueCode: string, auctionDate: string, weightedAverageRate: number): AuctionPrint =>
      ({ id: issueCode + auctionDate, issueCode, auctionDate, weightedAverageRate }) as AuctionPrint;
    const c = latestBondAuction([p('A', '2026-09-02', 13), p('B', '2026-09-16', 13.6105), p('C', '2026-09-16', 14.2355)]);
    expect(c?.value).toBe('B 13.61% · C 14.24%');
    expect(c?.asOf).toBe('2026-09-16');
  });

  it('compares inflation with the month before', () => {
    const pt = (date: string, value: number) => ({ id: date, indicator: 'CPI', value, date, unit: '%', source: 'CBK', series: 's' }) as CpiPoint;
    const c = cpiChange([pt('2026-08-01', 6.6), pt('2026-07-01', 6.49)]);
    expect(c?.value).toBe('6.6%');
    expect(c?.change).toBe('up from 6.5%');
    expect(c?.direction).toBe('up');
  });
});
