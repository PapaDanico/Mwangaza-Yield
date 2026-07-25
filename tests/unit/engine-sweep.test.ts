import { describe, it, expect } from 'vitest';
import bondsJson from '../../public/data/bonds.json';
import {
  computeBondInvestment, calculateAccruedInterest, getNextCouponDate,
  getLastCouponDate, solveYTMFromPrice, determineWHTRate,
} from '../../src/lib/financial-engine';
import type { Bond } from '../../src/types/bond';

const bonds = bondsJson as unknown as Bond[];
const TODAY = new Date('2026-07-25T00:00:00Z');

describe('every listed bond behaves sanely today', () => {
  it('has bonds to check', () => expect(bonds.length).toBeGreaterThan(50));

  it('accrued interest never exceeds one coupon period', () => {
    const bad: string[] = [];
    for (const b of bonds) {
      const accrued = calculateAccruedInterest(b, TODAY);
      const perPeriod = b.couponRate / (b.couponFrequencyPerYear || 2);
      // A tolerance for the stub period at issue; exceeding by more than a
      // few percent means lastCouponDate is wrong.
      if (accrued > perPeriod * 1.02 || accrued < 0) {
        bad.push(`${b.issueCode}: accrued ${accrued.toFixed(3)} vs period coupon ${perPeriod.toFixed(3)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the YTM solver converges away from its bounds', () => {
    const bad: string[] = [];
    for (const b of bonds) {
      const y = solveYTMFromPrice(b, 100 + calculateAccruedInterest(b, TODAY), TODAY, 1);
      if (!Number.isFinite(y) || y <= 0.01 || y >= 199) bad.push(`${b.issueCode}: ytm ${y}`);
    }
    expect(bad).toEqual([]);
  });

  it('produces finite, ordered results at par', () => {
    const bad: string[] = [];
    for (const b of bonds) {
      const r = computeBondInvestment(b, 1_000_000, 100, TODAY);
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${b.issueCode}.${k} = ${v}`);
      }
      if (r.netYTM > r.grossYTM + 1e-9) bad.push(`${b.issueCode}: net ${r.netYTM} > gross ${r.grossYTM}`);
      if (r.taxDragBps < -1e-6) bad.push(`${b.issueCode}: negative tax drag ${r.taxDragBps}`);
      if (b.taxExempt && Math.abs(r.taxDragBps) > 1e-6) bad.push(`${b.issueCode}: IFB has tax drag`);
      if (r.settlementCostKES <= 0) bad.push(`${b.issueCode}: settlement ${r.settlementCostKES}`);
    }
    expect(bad).toEqual([]);
  });

  it('always has a next coupon date before maturity', () => {
    const bad: string[] = [];
    for (const b of bonds) {
      const next = getNextCouponDate(b, TODAY);
      if (!next) { bad.push(`${b.issueCode}: no next coupon`); continue; }
      if (next > new Date(b.maturityDate)) bad.push(`${b.issueCode}: next coupon after maturity`);
      if (getLastCouponDate(b, TODAY) > TODAY) bad.push(`${b.issueCode}: last coupon in the future`);
    }
    expect(bad).toEqual([]);
  });

  it('taxes fractional tenors on the issued tenor', () => {
    // IFB1/2024/8.5 is tax-exempt anyway, but the rule must not crash on 8.5.
    expect(determineWHTRate({ taxExempt: false, tenorYears: 8.5 })).toBe(0.15);
    expect(determineWHTRate({ taxExempt: false, tenorYears: 10 })).toBe(0.1);
    expect(determineWHTRate({ taxExempt: true, tenorYears: 6.5 })).toBe(0);
  });
});
