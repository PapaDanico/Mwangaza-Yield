import { describe, it, expect } from 'vitest';
import bondsData from '../../public/data/bonds.json';
import { planPassiveIncome, planSchoolFees } from '../../src/lib/goals';
import type { Bond } from '../../src/types/bond';

/**
 * Tailoring the goal objectives.
 *
 * Both planners optimise for something sensible and narrow — the fee ladder for
 * net yield inside each maturity window, the income planner for the widest
 * spread of payout months. Each is blind to the reasons a person actually
 * holds a particular bond. These tests pin the promise that an explicit
 * selection is honoured, and that its consequences are shown rather than
 * corrected.
 */

const bonds = bondsData as unknown as Bond[];
const ASOF = new Date('2026-07-26');
const live = bonds
  .filter((b) => new Date(b.maturityDate) > ASOF)
  .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

describe('school fees: choosing the bonds that fund them', () => {
  const base = () => planSchoolFees(bonds, [], 3_000_000, 2032, 4, 400_000, ASOF, []);

  it('uses exactly the bonds named', () => {
    const want = [live[4], live[8], live[12]].map((b) => b.isin);
    const plan = planSchoolFees(bonds, [], 3_000_000, 2032, 4, 400_000, ASOF, [], want);
    expect(plan.ladder.rungs).toHaveLength(3);
    expect(new Set(plan.ladder.rungs.map((r) => r.bond.isin))).toEqual(new Set(want));
  });

  it('an empty selection leaves the automatic plan untouched', () => {
    const auto = base();
    const explicitlyEmpty = planSchoolFees(bonds, [], 3_000_000, 2032, 4, 400_000, ASOF, [], []);
    expect(explicitlyEmpty.ladder.rungs.map((r) => r.bond.isin)).toEqual(
      auto.ladder.rungs.map((r) => r.bond.isin),
    );
    expect(explicitlyEmpty.totalCoveredKES).toBeCloseTo(auto.totalCoveredKES, 6);
  });

  /**
   * The point of tailoring: a reader who picks paper maturing away from the fee
   * years must SEE the coverage fall, not have it quietly repaired.
   */
  it('shows the coverage consequence of a poor choice', () => {
    // Everything maturing well before the first fee year.
    const early = live.slice(0, 3).map((b) => b.isin);
    const tailored = planSchoolFees(bonds, [], 3_000_000, 2038, 3, 400_000, ASOF, [], early);
    expect(tailored.ladder.rungs.length).toBeGreaterThan(0);
    // Principal comes back long before the invoices, so the fee years are bare.
    const principalInFeeYears = tailored.years.reduce((s, y) => s + y.principalMaturingKES, 0);
    expect(principalInFeeYears).toBe(0);
    expect(tailored.fullyFunded).toBe(false);
  });

  it('still recomputes fee coverage from the chosen bonds', () => {
    const want = live.slice(0, 4).map((b) => b.isin);
    const plan = planSchoolFees(bonds, [], 4_000_000, 2032, 4, 400_000, ASOF, [], want);
    // Every fee year is accounted for, and covered never exceeds the fee.
    expect(plan.years).toHaveLength(4);
    for (const y of plan.years) {
      expect(y.coveredKES).toBeCloseTo(y.principalMaturingKES + y.couponsKES, 6);
      expect(y.shortfallKES).toBeCloseTo(Math.max(0, y.feeKES - y.coveredKES), 6);
    }
    expect(plan.totalFeesKES).toBe(1_600_000);
  });
});

describe('passive income: choosing the bonds that pay it', () => {
  it('uses exactly the bonds named, ignoring the month-coverage search', () => {
    const want = [live[2], live[7]].map((b) => b.isin);
    const plan = planPassiveIncome(bonds, [], 2_000_000, 3, [], want);
    expect(plan.holdings.map((h) => h.bond.isin)).toEqual(want);
  });

  it('is not capped by maxHoldings once the reader has chosen', () => {
    const want = live.slice(0, 5).map((b) => b.isin);
    const plan = planPassiveIncome(bonds, [], 5_000_000, 3, [], want);
    expect(plan.holdings).toHaveLength(5);
  });

  /**
   * The calendar must follow the choice, including into a worse outcome. A
   * planner that silently improved on the reader's selection would make the
   * control a decoration — the same bug the SHA employment-type selector had.
   */
  it('recomputes the month calendar from the chosen bonds, even if that is worse', () => {
    const auto = planPassiveIncome(bonds, [], 3_000_000, 3, []);
    // One bond only: at most two paying months on Kenyan semi-annual coupons.
    const single = planPassiveIncome(bonds, [], 3_000_000, 3, [], [live[0].isin]);
    expect(single.holdings).toHaveLength(1);
    expect(single.monthsPaid).toBeLessThanOrEqual(2);
    expect(single.monthsPaid).toBeLessThan(auto.monthsPaid);
    // And the total is the one bond's own coupons, not the automatic plan's.
    expect(single.totalNetAnnualKES).not.toBeCloseTo(auto.totalNetAnnualKES, 2);
  });

  it('the calendar sums to the reported annual total', () => {
    const plan = planPassiveIncome(bonds, [], 3_000_000, 3, [], live.slice(0, 3).map((b) => b.isin));
    const summed = plan.monthlyIncomeKES.reduce((s, v) => s + v, 0);
    expect(summed).toBeCloseTo(plan.totalNetAnnualKES, 6);
    expect(plan.averageMonthlyKES).toBeCloseTo(plan.totalNetAnnualKES / 12, 6);
    expect(plan.monthlyIncomeKES).toHaveLength(12);
  });

  it('collapses duplicates and ignores unknown ISINs', () => {
    const plan = planPassiveIncome(
      bonds, [], 2_000_000, 3, [],
      [live[1].isin, live[1].isin, 'NOT-A-BOND'],
    );
    expect(plan.holdings.map((h) => h.bond.isin)).toEqual([live[1].isin]);
  });

  it('splits capital evenly in 50k steps across the chosen holdings', () => {
    const want = live.slice(0, 4).map((b) => b.isin);
    const plan = planPassiveIncome(bonds, [], 4_000_000, 3, [], want);
    const faces = plan.holdings.map((h) => h.faceValueKES);
    expect(new Set(faces).size).toBe(1);
    expect(faces[0] % 50_000).toBe(0);
    expect(faces[0]).toBe(1_000_000);
  });
});
