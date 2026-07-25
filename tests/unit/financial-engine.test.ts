import { describe, it, expect } from 'vitest';
import {
  determineWHTRate,
  getCouponDates,
  getLastCouponDate,
  getNextCouponDate,
  calculateAccruedInterest,
  computeBondInvestment,
  solveYTMFromPrice,
  couponsByMonth,
} from '../../src/lib/financial-engine';
import type { Bond } from '../../src/types/bond';

const fxd10: Bond = {
  isin: 'KE1000004AAA',
  issueCode: 'FXD1/2024/10',
  name: '10-Year Fixed Coupon Bond',
  category: 'FXD',
  issueDate: '2024-02-12',
  maturityDate: '2034-01-30',
  tenorYears: 10,
  couponRate: 16.0,
  couponFrequencyPerYear: 2,
  ytmGross: 16.0,
  minInvestmentKES: 50000,
  taxExempt: false,
};

const ifb: Bond = { ...fxd10, issueCode: 'IFB1/2023/17', category: 'IFB', tenorYears: 17, taxExempt: true, couponRate: 14.399, ytmGross: 17.9 };
const fxd5: Bond = { ...fxd10, issueCode: 'FXD1/2024/5', tenorYears: 5, maturityDate: '2029-02-12' };

describe('determineWHTRate', () => {
  it('IFB exempt', () => expect(determineWHTRate(ifb)).toBe(0));
  it('>=10y is 10%', () => expect(determineWHTRate(fxd10)).toBe(0.1));
  it('<10y is 15%', () => expect(determineWHTRate(fxd5)).toBe(0.15));
});

describe('coupon dates', () => {
  it('semi-annual schedule ends at maturity', () => {
    const dates = getCouponDates(new Date('2024-02-12'), new Date('2029-02-12'), 2);
    expect(dates.length).toBe(10);
    expect(dates[0].toISOString().slice(0, 10)).toBe('2024-08-12');
    expect(dates[dates.length - 1].toISOString().slice(0, 10)).toBe('2029-02-12');
  });
  it('last/next around settlement', () => {
    const settle = new Date('2025-03-01');
    expect(getLastCouponDate(fxd5, settle).toISOString().slice(0, 10)).toBe('2025-02-12');
    expect(getNextCouponDate(fxd5, settle)!.toISOString().slice(0, 10)).toBe('2025-08-12');
  });
  it('before first coupon, last = issue date', () => {
    const settle = new Date('2024-05-01');
    expect(getLastCouponDate(fxd5, settle).toISOString().slice(0, 10)).toBe('2024-02-12');
  });
});

describe('accrued interest (Act/365)', () => {
  it('zero on coupon date', () => {
    expect(calculateAccruedInterest(fxd5, new Date('2025-02-12'))).toBeCloseTo(0, 8);
  });
  it('30 days accrual', () => {
    // 16% * 30/365 = 1.3151 per 100
    expect(calculateAccruedInterest(fxd5, new Date('2025-03-14'))).toBeCloseTo((16 * 30) / 365, 4);
  });
});

describe('couponsByMonth', () => {
  const from = new Date('2026-07-24');

  it('returns exactly `months` buckets in chronological order', () => {
    const b = couponsByMonth(fxd5, from, 12);
    expect(b).toHaveLength(12);
    expect(b[0]).toMatchObject({ year: 2026, month: 6 });  // July
    expect(b[11]).toMatchObject({ year: 2027, month: 5 }); // June
  });

  it('lands semi-annual coupons in the right months and nowhere else', () => {
    // fxd5 issued 2024-02-12 → coupons every Feb and Aug.
    const b = couponsByMonth(fxd5, from, 12);
    const hits = b.filter((x) => x.count > 0);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.month).sort()).toEqual([1, 7]); // Feb, Aug
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(2);
  });

  it('excludes coupons on or before the start date', () => {
    const onCoupon = new Date('2026-08-12');
    const b = couponsByMonth(fxd5, onCoupon, 12);
    expect(b[0].count).toBe(0); // August's coupon is not counted again
  });

  it('stops at maturity — no phantom coupons after redemption', () => {
    // fxd5 matures 2029-02-12; look 12 months from mid-2029.
    const b = couponsByMonth(fxd5, new Date('2029-06-01'), 12);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(0);
  });
});

describe('solveYTMFromPrice', () => {
  it('at par on issue date, YTM ≈ coupon', () => {
    const y = solveYTMFromPrice(fxd10, 100, new Date('2024-02-12'));
    expect(y).toBeCloseTo(16.0, 1);
  });
  it('discount price → YTM above coupon; premium → below', () => {
    const settle = new Date('2024-02-12');
    expect(solveYTMFromPrice(fxd10, 90, settle)).toBeGreaterThan(16.0);
    expect(solveYTMFromPrice(fxd10, 110, settle)).toBeLessThan(16.0);
  });
  it('round-trips: price computed at solved yield matches input', () => {
    // Solve then re-discount by hand at the solved rate.
    const settle = new Date('2024-02-12');
    const y = solveYTMFromPrice(fxd10, 95, settle) / 100;
    let pv = 0;
    const flows = 20; // 10y semi-annual
    for (let i = 1; i <= flows; i++) pv += 8 / Math.pow(1 + y / 2, i) + (i === flows ? 100 / Math.pow(1 + y / 2, i) : 0);
    expect(pv).toBeCloseTo(95, 0);
  });
});

describe('computeBondInvestment', () => {
  it('at par, taxable 10y: net ≈ taxed-coupon rate, drag ≈ 160bps', () => {
    const r = computeBondInvestment(fxd10, 1_000_000, 100, new Date('2024-02-12'));
    expect(r.settlementCostKES).toBeCloseTo(1_000_000, 0);
    expect(r.grossCouponPerPeriodKES).toBeCloseTo(80_000, 0);
    expect(r.netCouponPerPeriodKES).toBeCloseTo(72_000, 0);
    expect(r.grossYTM).toBeCloseTo(16.0, 1);
    expect(r.netYTM).toBeCloseTo(14.4, 1);
    expect(r.taxDragBps).toBeGreaterThan(140);
    expect(r.taxDragBps).toBeLessThan(180);
  });
  it('yields respond to price', () => {
    const cheap = computeBondInvestment(fxd10, 1_000_000, 92, new Date('2024-02-12'));
    const dear = computeBondInvestment(fxd10, 1_000_000, 108, new Date('2024-02-12'));
    expect(cheap.grossYTM).toBeGreaterThan(dear.grossYTM);
    expect(cheap.netYTM).toBeGreaterThan(dear.netYTM);
  });
  it('IFB has zero tax drag', () => {
    const r = computeBondInvestment(ifb, 1_000_000, 100, new Date('2024-02-12'));
    expect(r.netYTM).toBe(r.grossYTM);
    expect(r.taxDragBps).toBe(0);
  });
  it('dirty price includes accrued', () => {
    const r = computeBondInvestment(fxd5, 100_000, 98, new Date('2025-03-14'));
    expect(r.dirtyPrice).toBeGreaterThan(98);
    expect(r.settlementCostKES).toBeCloseTo((100_000 * r.dirtyPrice) / 100, 2);
  });
});

describe('tenor is the issued tenor, not a date calculation', () => {
  // Real CBK data: FXD1/2022/10 runs 2022-05-16 to 2032-05-03. That span is
  // 9.97 years, because settlement and business-day conventions shave a few
  // days off. It is still a TEN-YEAR bond, issued and taxed as one.
  //
  // Deriving tenor from the dates would put it in the 15% withholding band
  // instead of 10% and understate its net yield for every user. This test
  // exists so that "correcting" tenorYears from the dates fails loudly.
  const realTenYear: Bond = {
    isin: 'KE7000009436', issueCode: 'FXD1/2022/10', name: 'FXD1/2022/10',
    category: 'FXD', issueDate: '2022-05-16', maturityDate: '2032-05-03',
    tenorYears: 10, couponRate: 13.49, couponFrequencyPerYear: 2,
    ytmGross: 13.5, minInvestmentKES: 50_000, taxExempt: false,
  };

  it('taxes a ten-year bond at 10% even though its span is 9.97 years', () => {
    const spanYears =
      (new Date(realTenYear.maturityDate).getTime() - new Date(realTenYear.issueDate).getTime()) /
      (365.25 * 86_400_000);
    expect(spanYears).toBeLessThan(10);          // the trap
    expect(determineWHTRate(realTenYear)).toBe(0.1); // the correct answer
  });

  it('would have overtaxed it had tenor been derived from the dates', () => {
    const derived = { ...realTenYear, tenorYears: 9.97 };
    expect(determineWHTRate(derived)).toBe(0.15);
  });
});
