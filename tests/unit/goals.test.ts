import { describe, it, expect } from 'vitest';
import {
  GOALS, planFire, planSchoolFees, planPassiveIncome, priceIncomeSpreads, planPreservation, couponMonths,
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
  it('required capital is target income divided by the PLANNING yield', () => {
    const p = planFire(universe, [], 1_200_000, 0, 0);
    expect(p.requiredCapitalKES).toBeCloseTo(1_200_000 / (p.planningNetYield / 100), 0);
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

describe('planSchoolFees cannot be hung by its own arguments', () => {
  it('caps the fee years however many are asked for', () => {
    // A stray paste of 1000000 allocated a FeeYear and rendered a table row per
    // iteration, wedging the tab so hard that reloading the page timed out.
    const p = planSchoolFees(universe, [], 3_000_000, 2032, 1_000_000, 400_000, asOf);
    expect(p.years.length).toBe(8);
    expect(Number.isFinite(p.totalFeesKES)).toBe(true);
  });

  it('refuses a fee year in the far future', () => {
    const p = planSchoolFees(universe, [], 3_000_000, 1_000_000, 3, 400_000, asOf);
    expect(p.years[0].year).toBeLessThanOrEqual(asOf.getFullYear() + 40);
    expect(p.years).toHaveLength(3);
  });

  it('refuses a fee year in the past', () => {
    const p = planSchoolFees(universe, [], 3_000_000, 1990, 3, 400_000, asOf);
    expect(p.years[0].year).toBeGreaterThanOrEqual(asOf.getFullYear());
  });

  it('treats zero or nonsense years as one', () => {
    expect(planSchoolFees(universe, [], 3_000_000, 2032, 0, 400_000, asOf).years).toHaveLength(1);
    expect(planSchoolFees(universe, [], 3_000_000, 2032, NaN, 400_000, asOf).years).toHaveLength(1);
    expect(planSchoolFees(universe, [], 3_000_000, 2032, -5, 400_000, asOf).years).toHaveLength(1);
  });

  it('still honours an ordinary request', () => {
    const p = planSchoolFees(universe, [], 3_000_000, 2032, 4, 400_000, asOf);
    expect(p.years).toHaveLength(4);
    expect(p.years[0].year).toBe(2032);
  });
});

describe('planFire plans conservatively, not on the best bond', () => {
  // Two MPC decisions: the rate has fallen 3 points from its record high, so a
  // plan must assume reinvestment could give back the same 3 points.
  const cbr = [
    { id: '1', date: '2023-01-01', rate: 8.00, title: 'low', url: '', move: 'cut' as const, changeBps: 0 },
    { id: '2', date: '2026-06-01', rate: 11.00, title: 'now', url: '', move: 'hike' as const, changeBps: 0 },
  ];

  it('never plans on a rate above the buildable ladder', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, cbr);
    expect(p.planningNetYield).toBeLessThanOrEqual(p.currentLadderNetYield);
    expect(p.currentLadderNetYield).toBeLessThanOrEqual(p.bestNetYield);
  });

  it('marks the yield down by the fall the policy rate actually made', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, cbr);
    expect(p.downsidePp).toBeCloseTo(3, 10);
    expect(p.planningNetYield).toBeCloseTo(p.currentLadderNetYield - 3, 10);
  });

  it('asks for MORE capital than the optimistic case, never less', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, cbr);
    expect(p.requiredCapitalKES).toBeGreaterThan(p.requiredCapitalIfRatesHoldKES);
  });

  it('states a longer journey than the optimistic case', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, cbr);
    expect(p.yearsToTarget!).toBeGreaterThan(p.yearsIfRatesHold!);
  });

  it('is more cautious than the old best-bond basis it replaced', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, cbr);
    const oldRequired = 1_200_000 / (p.bestNetYield / 100);
    expect(p.requiredCapitalKES).toBeGreaterThan(oldRequired);
  });

  it('falls back to today rather than inventing a downside with no history', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, []);
    expect(p.downsidePp).toBe(0);
    expect(p.planningNetYield).toBeCloseTo(p.currentLadderNetYield, 10);
  });

  it('assumes no further fall when today is already the record low', () => {
    const atLow = [
      { id: '1', date: '2023-01-01', rate: 12.0, title: 'high', url: '', move: 'hike' as const, changeBps: 0 },
      { id: '2', date: '2026-06-01', rate: 6.0, title: 'low', url: '', move: 'cut' as const, changeBps: 0 },
    ];
    // Current IS the trough, so there is no fall on the record to assume.
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, [atLow[1]]);
    expect(p.downsidePp).toBe(0);
  });

  it('still reports the best bond for context', () => {
    const p = planFire(universe, [], 1_200_000, 2_000_000, 50_000, cbr);
    expect(p.bestBond).not.toBeNull();
    expect(p.bestNetYield).toBeGreaterThan(0);
  });
});

/**
 * School fees rise between the day you plan and the day you pay.
 *
 * The planner was built around a single `annualFeeKES` repeated for every fee
 * year, which is defensible for a bill due next January and indefensible for
 * one due in 2035. This objective has the longest gap of any planner here
 * between entering a figure and paying it — a parent of a Grade 3 child types
 * a fee from this January's invoice and a first fee year a decade out.
 *
 * The failure mode is the quiet kind: the ladder matures exactly on schedule,
 * every bond does what it promised, and the money still is not enough.
 */
describe('school fees, escalated', () => {
  const ASOF = new Date('2026-07-28');

  it('leaves the flat behaviour untouched when no rate is given', () => {
    // Every existing caller relies on this. A default that silently changed
    // what a stored plan means would be worse than the flat model.
    const flat = planSchoolFees(universe, [], 3_000_000, 2030, 3, 400_000, ASOF, []);
    expect(flat.years.map((y) => y.feeKES)).toEqual([400_000, 400_000, 400_000]);
    expect(flat.totalFeesKES).toBe(1_200_000);
  });

  it('escalates from today, not from the first fee year', () => {
    // 2030 is four years after the 2026 as-of date, so the first bill has
    // already had four years of increases before it is ever invoiced. Charging
    // escalation only across the fee years themselves would miss exactly the
    // stretch that does the damage.
    const plan = planSchoolFees(universe, [], 3_000_000, 2030, 3, 100_000, ASOF, [], [], 0.1);
    expect(plan.years[0].feeKES).toBe(Math.round(100_000 * 1.1 ** 4));
    expect(plan.years[1].feeKES).toBe(Math.round(100_000 * 1.1 ** 5));
    expect(plan.years[2].feeKES).toBe(Math.round(100_000 * 1.1 ** 6));
  });

  it('carries the escalated fees into the total and the shortfall', () => {
    // The half-applied version of this change computed escalated fees for
    // display while still totalling and comparing against the flat figure —
    // a plan that looks corrected and funds the wrong number.
    const plan = planSchoolFees(universe, [], 0, 2030, 3, 100_000, ASOF, [], [], 0.1);
    expect(plan.totalFeesKES).toBe(plan.years.reduce((s, y) => s + y.feeKES, 0));
    expect(plan.totalFeesKES).toBeGreaterThan(300_000);
    for (const y of plan.years) {
      // No capital, so every shilling of the escalated fee is a shortfall.
      expect(y.shortfallKES).toBe(y.feeKES);
    }
  });

  it('makes a plan that was fully funded flat fall short once fees rise', () => {
    // The finding, as a behaviour. Rather than hand-pick a capital figure and
    // hope it straddles the boundary, this searches for one: if no amount of
    // capital is fully funded flat and short once fees rise, the escalation is
    // not reaching the funding comparison and the test says so.
    const at = (capital: number, esc: number) =>
      planSchoolFees(universe, [], capital, 2032, 3, 400_000, ASOF, [], [], esc);

    const straddles = [1, 2, 3, 4, 5, 6].map((m) => m * 500_000)
      .filter((capital) => at(capital, 0).fullyFunded && !at(capital, 0.1).fullyFunded);

    expect(
      straddles.length,
      'no capital was fully funded on flat fees and short once they rise'
    ).toBeGreaterThan(0);

    for (const capital of straddles) {
      const flat = at(capital, 0);
      const risen = at(capital, 0.1);
      expect(risen.totalFeesKES).toBeGreaterThan(flat.totalFeesKES);
      expect(risen.totalCoveredKES / risen.totalFeesKES).toBeLessThan(1);
    }
  });

  it('treats a negative or broken rate as no escalation rather than shrinking fees', () => {
    for (const bad of [-0.5, NaN, Infinity]) {
      const plan = planSchoolFees(universe, [], 1_000_000, 2030, 2, 100_000, ASOF, [], [], bad);
      expect(plan.years.every((y) => y.feeKES === 100_000)).toBe(true);
    }
  });
});

/**
 * Every month, or an honest count of the months it misses.
 *
 * Kenyan government bonds pay semi-annually, so one bond covers exactly two
 * months of the year, six apart. The passive-income planner was capped at
 * three holdings and therefore at six months — while the page promised "a
 * payout most months of the year" and "income arrives evenly".
 *
 * All six month-pairs (Jan/Jul through Jun/Dec) exist in the live universe, so
 * twelve-month coverage was always reachable. Only the cap stood in the way.
 */
describe('smoothing income across the year', () => {
  const many = [
    mk('A/JAN', '2022-01-10', '2032-01-10', 13),
    mk('B/FEB', '2022-02-10', '2033-02-10', 13),
    mk('C/MAR', '2022-03-10', '2034-03-10', 13),
    mk('D/APR', '2022-04-10', '2035-04-10', 13),
    mk('E/MAY', '2022-05-10', '2036-05-10', 13),
    mk('F/JUN', '2022-06-10', '2037-06-10', 13),
  ];

  it('covers two months per bond, six apart', () => {
    // The structural fact everything below follows from.
    for (const b of many) {
      const m = couponMonths(b);
      expect(m).toHaveLength(2);
      expect(Math.abs(m[1] - m[0])).toBe(6);
    }
  });

  it('reaches every month once six bonds are allowed', () => {
    const plan = planPassiveIncome(many, [], 3_000_000, 6, []);
    expect(plan.monthsPaid).toBe(12);
    expect(plan.monthlyIncomeKES.filter((v) => v === 0)).toHaveLength(0);
  });

  it('cannot reach more than six months with three, however good the bonds', () => {
    // The cap was the whole constraint — not the market, not the yields.
    const plan = planPassiveIncome(many, [], 3_000_000, 3, []);
    expect(plan.monthsPaid).toBeLessThanOrEqual(6);
  });

  it('buys coverage with yield, which is the trade the reader is making', () => {
    // Filling a gap month means taking the best bond that pays IN it rather
    // than the best bond outright. If this ever inverts, the greedy pick has
    // stopped prioritising months and the page's promise is no longer true.
    const three = planPassiveIncome(many, [], 3_000_000, 3, []);
    const six = planPassiveIncome(many, [], 3_000_000, 6, []);
    expect(six.monthsPaid).toBeGreaterThan(three.monthsPaid);
    expect(six.totalNetAnnualKES).toBeLessThanOrEqual(three.totalNetAnnualKES);
  });

  it('gains nothing from a seventh holding', () => {
    // Six pairs exist and no more, so a seventh bond can only duplicate a
    // month it already has. The control stops at six for this reason.
    const six = planPassiveIncome(many, [], 3_000_000, 6, []);
    const seven = planPassiveIncome(many, [], 3_000_000, 7, []);
    expect(seven.monthsPaid).toBe(six.monthsPaid);
  });

  /**
   * The price of being paid every month, shown before it is paid.
   *
   * The options are the reader's whole decision, and `givesUpKES` is the only
   * number on the card they cannot work out for themselves. If it is wrong,
   * the page is quietly misstating the cost of a choice it is recommending —
   * which is worse than not offering the choice at all.
   */
  describe('the options put in front of the reader', () => {
    it('offers two through six, and no more', () => {
      const opts = priceIncomeSpreads(many, [], 3_000_000, []);
      expect(opts.map((o) => o.holdings)).toEqual([2, 3, 4, 5, 6]);
    });

    it('gives up nothing on exactly the option that earns the most', () => {
      const opts = priceIncomeSpreads(many, [], 3_000_000, []);
      const best = Math.max(...opts.map((o) => o.plan.totalNetAnnualKES));
      const free = opts.filter((o) => o.givesUpKES === 0);
      expect(free.length).toBeGreaterThan(0);
      for (const o of free) expect(o.plan.totalNetAnnualKES).toBe(best);
    });

    it('reports no cost when the bonds yield alike', () => {
      // `many` is six identical 13% bonds, so every spread earns the same and
      // smoothing really is free. The page should say so rather than invent a
      // sacrifice to make the recommendation feel considered.
      for (const o of priceIncomeSpreads(many, [], 3_000_000, [])) {
        expect(o.givesUpKES).toBe(0);
      }
    });

    it('states the shortfall against the best, to the shilling', () => {
      // The mutation check, and it needs a universe where the yields differ:
      // a givesUpKES hard-coded to 0 passes every other assertion here and
      // tells every reader that smoothing is free.
      const varied = [
        mk('A/JAN', '2022-01-10', '2032-01-10', 18),
        ...many.slice(1).map((b) => ({ ...b, couponRate: 10, ytmGross: 10 })),
      ];
      const opts = priceIncomeSpreads(varied, [], 3_000_000, []);
      const best = Math.max(...opts.map((o) => o.plan.totalNetAnnualKES));
      for (const o of opts) {
        expect(o.givesUpKES).toBe(best - o.plan.totalNetAnnualKES);
      }
      const widest = opts.find((o) => o.holdings === 6)!;
      expect(widest.plan.monthsPaid).toBe(12);
      expect(widest.givesUpKES, 'twelve months came at no cost').toBeGreaterThan(0);
    });

    it('prices each option as the plan the reader would actually get', () => {
      // The card shows one plan's figures and clicking it selects another
      // unless these agree.
      for (const o of priceIncomeSpreads(many, [], 3_000_000, [])) {
        const actual = planPassiveIncome(many, [], 3_000_000, o.holdings, [], []);
        expect(o.plan.monthsPaid).toBe(actual.monthsPaid);
        expect(o.plan.totalNetAnnualKES).toBe(actual.totalNetAnnualKES);
      }
    });

    it('offers nothing once the reader has named their own bonds', () => {
      // Their selection is used as given; alternatives from a greedy pick
      // would be an invitation to discard it.
      expect(priceIncomeSpreads(many, [], 3_000_000, [], ['A/JAN', 'B/FEB'])).toEqual([]);
    });
  });
});
