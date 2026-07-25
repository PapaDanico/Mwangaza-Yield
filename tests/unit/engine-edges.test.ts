import { describe, it, expect } from 'vitest';
import {
  computeBondInvestment, calculateAccruedInterest, getNextCouponDate, getCouponDates,
} from '../../src/lib/financial-engine';
import type { Bond } from '../../src/types/bond';

const bond = (over: Partial<Bond> = {}): Bond => ({
  isin: 'KE-T', issueCode: 'FXD1/2022/10', name: 'test', category: 'FXD',
  issueDate: '2022-01-10', maturityDate: '2032-01-10', tenorYears: 10,
  couponRate: 13, couponFrequencyPerYear: 2, ytmGross: 13,
  minInvestmentKES: 50_000, taxExempt: false, ...over,
});

describe('edge cases a user can actually reach', () => {
  it('accrued interest is zero exactly on a coupon date', () => {
    const b = bond();
    const onCoupon = new Date('2026-07-10T00:00:00Z');
    expect(calculateAccruedInterest(b, onCoupon)).toBeCloseTo(0, 6);
  });

  it('accrued approaches a full period the day before the next coupon', () => {
    const b = bond();
    const a = calculateAccruedInterest(b, new Date('2027-01-09T00:00:00Z'));
    expect(a).toBeGreaterThan(6.3);
    expect(a).toBeLessThanOrEqual(6.5 * 1.02);
  });

  it('a bond settling AFTER maturity does not produce nonsense', () => {
    const b = bond({ maturityDate: '2024-01-10' });
    const r = computeBondInvestment(b, 1_000_000, 100, new Date('2026-07-25T00:00:00Z'));
    expect(Number.isFinite(r.grossYTM)).toBe(true);
    expect(Number.isFinite(r.settlementCostKES)).toBe(true);
    expect(getNextCouponDate(b, new Date('2026-07-25T00:00:00Z'))).toBeNull();
    expect(r.nextCouponDate).toBeNull();
    // accrued must not keep growing forever past maturity
    expect(r.accruedInterestPer100).toBeLessThanOrEqual(6.5 * 1.02);
  });

  it('survives the price slider extremes', () => {
    for (const price of [70, 120]) {
      const r = computeBondInvestment(bond(), 1_000_000, price, new Date('2026-07-25T00:00:00Z'));
      expect(Number.isFinite(r.grossYTM)).toBe(true);
      expect(r.grossYTM).toBeGreaterThan(0);
      expect(r.netYTM).toBeLessThanOrEqual(r.grossYTM + 1e-9);
    }
  });

  it('handles a bond maturing within one coupon period', () => {
    const b = bond({ maturityDate: '2026-09-10' });
    const r = computeBondInvestment(b, 1_000_000, 100, new Date('2026-07-25T00:00:00Z'));
    expect(Number.isFinite(r.grossYTM)).toBe(true);
    expect(r.grossYTM).toBeGreaterThan(0);
  });

  it('a zero or negative face value does not yield NaN', () => {
    const r = computeBondInvestment(bond(), 0, 100, new Date('2026-07-25T00:00:00Z'));
    for (const [k, v] of Object.entries(r))
      if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
  });

  it('never emits a coupon date after maturity', () => {
    const b = bond({ maturityDate: '2032-01-09' }); // deliberately off-cycle
    const dates = getCouponDates(new Date(b.issueDate), new Date(b.maturityDate), 2);
    const after = dates.filter((d) => d > new Date(b.maturityDate));
    expect(after).toEqual([]);
  });
});
