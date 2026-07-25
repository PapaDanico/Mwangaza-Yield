// Objective-based planning: people don't want "a bond", they want school fees
// covered in 2033, or an income that arrives every month, or to stop working.
// Each planner turns a life goal into a concrete allocation over live paper.

import type { Bond, SecondaryTrade, TBill } from '@/types/bond';
import { computeBondInvestment, getCouponDates } from './financial-engine';
import { buildLadder, type LadderPlan } from './ladder';
import { computeTBill } from './tbills';
import { monthsToTarget } from './progress';

export type GoalKey = 'fire' | 'school-fees' | 'passive-income' | 'capital-preservation';

export interface GoalDefinition {
  key: GoalKey;
  title: string;
  tagline: string;
  description: string;
}

export const GOALS: GoalDefinition[] = [
  {
    key: 'fire',
    title: 'Financial independence',
    tagline: 'Live off the coupons',
    description:
      'Work out the capital needed to fund your annual spending from net bond income alone — and how far the money you have today gets you.',
  },
  {
    key: 'school-fees',
    title: 'School fees',
    tagline: 'Money that lands the term it is needed',
    description:
      'Match bond maturities to the years fees fall due, so principal returns just before each invoice rather than being sold at a loss.',
  },
  {
    key: 'passive-income',
    title: 'Passive income',
    tagline: 'A payout most months of the year',
    description:
      'Combine bonds whose coupon months complement each other, so income arrives evenly instead of twice a year in a lump.',
  },
  {
    key: 'capital-preservation',
    title: 'Capital preservation',
    tagline: 'Short, liquid, low duration',
    description:
      'Park money in Treasury bills where it stays close to hand and price risk is minimal — an emergency fund that still earns.',
  },
];

const priceOf = (b: Bond, secondary: SecondaryTrade[]) =>
  secondary.find((t) => t.isin === b.isin)?.price ?? 100;

/* ------------------------------------------------------------------ FIRE */

export interface FirePlan {
  targetAnnualIncomeKES: number;
  bestNetYield: number;
  bestBond: Bond | null;
  /** Capital needed so net coupons alone cover the target. */
  requiredCapitalKES: number;
  currentCapitalKES: number;
  incomeFromCurrentKES: number;
  coverageRatio: number;      // 0–1+ of target already funded
  shortfallKES: number;
  /** Years to close the shortfall while contributing and reinvesting. */
  yearsToTarget: number | null;
}

export function planFire(
  bonds: Bond[],
  secondary: SecondaryTrade[],
  targetAnnualIncomeKES: number,
  currentCapitalKES: number,
  monthlyContributionKES: number
): FirePlan {
  // Long-horizon money should ride the highest sustainable net yield; tax-free
  // IFBs usually win here precisely because WHT never touches them.
  const ranked = bonds
    .map((bond) => ({ bond, netYTM: computeBondInvestment(bond, 100_000, priceOf(bond, secondary)).netYTM }))
    .sort((a, b) => b.netYTM - a.netYTM);
  const best = ranked[0] ?? null;
  const netYield = best ? best.netYTM : 0;
  const r = netYield / 100;

  const requiredCapitalKES = r > 0 ? targetAnnualIncomeKES / r : 0;
  const incomeFromCurrentKES = currentCapitalKES * r;
  const shortfallKES = Math.max(0, requiredCapitalKES - currentCapitalKES);

  // Future value of a growing pot, stepped monthly because that is how the
  // contributions are actually made. This is the same projection the progress
  // tracker measures recorded checkpoints against — deliberately one function,
  // so a saver is never marked "behind" against a curve that differs from the
  // one their plan was drawn with.
  const months = monthsToTarget(
    currentCapitalKES,
    monthlyContributionKES,
    netYield,
    requiredCapitalKES
  );
  const yearsToTarget = months === null ? null : months / 12;

  return {
    targetAnnualIncomeKES,
    bestNetYield: netYield,
    bestBond: best?.bond ?? null,
    requiredCapitalKES,
    currentCapitalKES,
    incomeFromCurrentKES,
    coverageRatio: requiredCapitalKES > 0 ? currentCapitalKES / requiredCapitalKES : 0,
    shortfallKES,
    yearsToTarget,
  };
}

/* ----------------------------------------------------------- School fees */

export interface FeeYear {
  year: number;
  feeKES: number;
  principalMaturingKES: number;
  couponsKES: number;
  coveredKES: number;
  shortfallKES: number;
}

export interface SchoolFeesPlan {
  ladder: LadderPlan;
  years: FeeYear[];
  totalFeesKES: number;
  totalCoveredKES: number;
  fullyFunded: boolean;
}

export function planSchoolFees(
  bonds: Bond[],
  secondary: SecondaryTrade[],
  capitalKES: number,
  firstFeeYear: number,
  yearsOfFees: number,
  annualFeeKES: number,
  asOf: Date = new Date()
): SchoolFeesPlan {
  const lastFeeYear = firstFeeYear + yearsOfFees - 1;
  const horizonYears = Math.max(1, lastFeeYear - asOf.getFullYear() + 1);
  // One rung per fee year: principal should land the year the invoice does.
  const ladder = buildLadder(bonds, secondary, capitalKES, horizonYears, Math.min(6, yearsOfFees), asOf);

  const years: FeeYear[] = [];
  for (let i = 0; i < yearsOfFees; i++) {
    const year = firstFeeYear + i;
    const payout = ladder.yearlyPayouts.find((p) => p.year === year);
    const principalMaturingKES = payout?.principalKES ?? 0;
    const couponsKES = payout?.couponsKES ?? 0;
    const coveredKES = principalMaturingKES + couponsKES;
    years.push({
      year,
      feeKES: annualFeeKES,
      principalMaturingKES,
      couponsKES,
      coveredKES,
      shortfallKES: Math.max(0, annualFeeKES - coveredKES),
    });
  }

  const totalFeesKES = annualFeeKES * yearsOfFees;
  const totalCoveredKES = years.reduce((s, y) => s + Math.min(y.coveredKES, y.feeKES), 0);

  return {
    ladder,
    years,
    totalFeesKES,
    totalCoveredKES,
    fullyFunded: years.every((y) => y.shortfallKES === 0),
  };
}

/* --------------------------------------------------------- Passive income */

export interface IncomePlan {
  holdings: { bond: Bond; faceValueKES: number; netCouponKES: number; months: number[] }[];
  /** Net income landing in each calendar month, index 0 = January. */
  monthlyIncomeKES: number[];
  monthsPaid: number;
  totalNetAnnualKES: number;
  averageMonthlyKES: number;
  /** Smoothest possible is 12; 2 means one bond paying twice a year. */
  smoothness: number;
}

/** Calendar months (0-11) in which a bond pays a coupon. */
export function couponMonths(bond: Bond): number[] {
  const dates = getCouponDates(
    new Date(bond.issueDate),
    new Date(bond.maturityDate),
    bond.couponFrequencyPerYear || 2
  );
  return Array.from(new Set(dates.slice(0, bond.couponFrequencyPerYear || 2).map((d) => d.getMonth()))).sort(
    (a, b) => a - b
  );
}

export function planPassiveIncome(
  bonds: Bond[],
  secondary: SecondaryTrade[],
  capitalKES: number,
  maxHoldings = 3
): IncomePlan {
  // Greedy: repeatedly take the bond that adds the most *new* payout months,
  // breaking ties on net yield. Spreading beats a marginally higher coupon
  // when the point of the money is a monthly income.
  const pool = bonds.map((bond) => ({
    bond,
    months: couponMonths(bond),
    netYTM: computeBondInvestment(bond, 100_000, priceOf(bond, secondary)).netYTM,
  }));

  const chosen: typeof pool = [];
  const covered = new Set<number>();
  while (chosen.length < maxHoldings && chosen.length < pool.length) {
    const next = pool
      .filter((p) => !chosen.includes(p))
      .map((p) => ({ p, gain: p.months.filter((m) => !covered.has(m)).length }))
      .sort((a, b) => b.gain - a.gain || b.p.netYTM - a.p.netYTM)[0];
    if (!next) break;
    chosen.push(next.p);
    next.p.months.forEach((m) => covered.add(m));
  }

  const per = Math.max(0, Math.floor(capitalKES / Math.max(1, chosen.length) / 50_000) * 50_000);
  const monthlyIncomeKES = Array(12).fill(0);
  const holdings = chosen.map((c) => {
    const r = computeBondInvestment(c.bond, per, priceOf(c.bond, secondary));
    for (const m of c.months) monthlyIncomeKES[m] += r.netCouponPerPeriodKES;
    return { bond: c.bond, faceValueKES: per, netCouponKES: r.netCouponPerPeriodKES, months: c.months };
  });

  const totalNetAnnualKES = monthlyIncomeKES.reduce((s, v) => s + v, 0);
  const monthsPaid = monthlyIncomeKES.filter((v) => v > 0).length;

  return {
    holdings,
    monthlyIncomeKES,
    monthsPaid,
    totalNetAnnualKES,
    averageMonthlyKES: totalNetAnnualKES / 12,
    smoothness: monthsPaid,
  };
}

/* --------------------------------------------------- Capital preservation */

export interface PreservationPlan {
  tenorDays: number;
  discountRate: number;
  netEAY: number;
  costKES: number;
  netProceedsKES: number;
  netInterestKES: number;
}

export function planPreservation(tbills: TBill[], capitalKES: number): PreservationPlan | null {
  // Shortest tenor that still pays: liquidity is the objective, not yield.
  const shortest = [...tbills].sort((a, b) => a.tenorDays - b.tenorDays)[0];
  if (!shortest) return null;
  const r = computeTBill(capitalKES, shortest.discountRate, shortest.tenorDays);
  return {
    tenorDays: shortest.tenorDays,
    discountRate: shortest.discountRate,
    netEAY: r.netEAY,
    costKES: r.costKES,
    netProceedsKES: r.netProceedsKES,
    netInterestKES: r.netInterestKES,
  };
}
