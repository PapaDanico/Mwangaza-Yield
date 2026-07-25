import { describe, it, expect } from 'vitest';
import {
  GOALS, planFire, planSchoolFees, planPassiveIncome, planPreservation, couponMonths,
} from '../../src/lib/goals';
import type { Bond, TBill } from '../../src/types/bond';

const asOf = new Date('2026-07-24');

const mk = (code: string, issue: string, maturity: string, coupon: number, taxExempt = false): Bond => ({
  isin: `KE-${code}`, issueCode: code, name: code, category: taxExempt ? 'IFB' : 'FXD',
  issueDate: issue, maturityDate: maturity, tenorYears: 10, couponRate: coupon,
  couponFrequencyPerYear: 2, ytmGross: coupon, minInvestmentKES: 50_000, taxExempt,
});

// Coupons in Feb/Aug, May/Nov and Mar/Sep respectively.
const febAug = mk('FXD1/FEB', '2022-02-10', '2032-02-10', 13);
const mayNov = mk('FXD1/MAY', '2022-05-10', '2033-05-10', 13.2);
const marSep = mk('IFB1/MAR', '2022-03-10', '2034-03-10', 12.8, true);
const universe = [febAug, mayNov, marSep];

describe('GOALS', () => {
  it('exposes the four life objectives', () => {
    expect(GOALS.map((g) => g.key)).toEqual([
      'fire', 'school-fees', 'passive-income', 'capital-preservation',
    ]);
  });
});

describe('planFire', () => {
  it('required capital is target income divided by net yield', () => {
    const p = planFire(universe, [], 1_200_000, 0, 0);
    expect(p.requiredCapitalKES).toBeCloseTo(1_200_000 / (p.bestNetYield / 100), 0);
    expect(p.coverageRatio).toBe(0);
    expect(p.shortfallKES).toBeCloseTo(p.requiredCapitalKES, 0);
  });

  it('prefers the highest net yield, which favours tax-free paper', () => {
    const p = planFire(universe, [], 1_000_000, 0, 0);
    expect(p.bestBond?.taxExempt).toBe(true); // 12.8% tax-free beats 13.2% taxed
  });

  it('reports zero years when already funded', () => {
    const p = planFire(universe, [], 100_000, 50_000_000, 0);
    expect(p.shortfallKES).toBe(0);
    expect(p.yearsToTarget).toBe(0);
    expect(p.coverageRatio).toBeGreaterThan(1);
  });

  it('contributions shorten the time to target', () => {
    const slow = planFire(universe, [], 1_200_000, 1_000_000, 10_000);
    const fast = planFire(universe, [], 1_200_000, 1_000_000, 100_000);
    expect(fast.yearsToTarget!).toBeLessThan(slow.yearsToTarget!);
  });
});

describe('planSchoolFees', () => {
  const p = planSchoolFees(universe, [], 3_000_000, 2032, 3, 400_000, asOf);

  it('produces one row per fee year', () => {
    expect(p.years.map((y) => y.year)).toEqual([2032, 2033, 2034]);
    expect(p.totalFeesKES).toBe(1_200_000);
  });

  it('counts maturing principal in the year it lands', () => {
    const y2032 = p.years.find((y) => y.year === 2032)!;
    expect(y2032.principalMaturingKES).toBeGreaterThan(0);
    expect(y2032.coveredKES).toBe(y2032.principalMaturingKES + y2032.couponsKES);
  });

  it('flags a shortfall when fees exceed what lands that year', () => {
    const thin = planSchoolFees(universe, [], 150_000, 2032, 3, 5_000_000, asOf);
    expect(thin.fullyFunded).toBe(false);
    expect(thin.years.some((y) => y.shortfallKES > 0)).toBe(true);
  });
});

describe('couponMonths', () => {
  it('reads the payout months off the issue schedule', () => {
    expect(couponMonths(febAug)).toEqual([1, 7]);  // Feb, Aug
    expect(couponMonths(mayNov)).toEqual([4, 10]); // May, Nov
  });
});

describe('planPassiveIncome', () => {
  it('spreads payouts across as many months as possible', () => {
    const p = planPassiveIncome(universe, [], 3_000_000, 3);
    expect(p.holdings).toHaveLength(3);
    expect(p.monthsPaid).toBe(6); // Feb, Mar, May, Aug, Sep, Nov
    expect(p.totalNetAnnualKES).toBeGreaterThan(0);
    expect(p.averageMonthlyKES).toBeCloseTo(p.totalNetAnnualKES / 12, 6);
  });

  it('picks complementary months before chasing yield', () => {
    // Two bonds paying the same months: the second adds no new months, so a
    // third bond with fresh months must be preferred.
    const duplicate = mk('FXD1/FEB2', '2022-02-10', '2035-02-10', 14);
    const p = planPassiveIncome([febAug, duplicate, mayNov], [], 3_000_000, 2);
    expect(p.holdings.map((h) => h.bond.issueCode)).toContain('FXD1/MAY');
  });

  it('allocates in 50k steps', () => {
    const p = planPassiveIncome(universe, [], 1_000_000, 3);
    for (const h of p.holdings) expect(h.faceValueKES % 50_000).toBe(0);
  });
});

describe('planPreservation', () => {
  const bills: TBill[] = [
    { id: 'a', tenorDays: 182, discountRate: 8.9695, auctionDate: '2026-07-16', nextAuctionDate: '2026-07-30', amountOfferedKES: 0, amountAcceptedKES: 0, minInvestmentKES: 100_000, source: 'x' },
    { id: 'b', tenorDays: 91, discountRate: 8.7986, auctionDate: '2026-07-16', nextAuctionDate: '2026-07-30', amountOfferedKES: 0, amountAcceptedKES: 0, minInvestmentKES: 100_000, source: 'x' },
  ];

  it('chooses the shortest tenor — liquidity over yield', () => {
    expect(planPreservation(bills, 500_000)!.tenorDays).toBe(91);
  });

  it('returns null with no bills', () => expect(planPreservation([], 100_000)).toBeNull());
});
