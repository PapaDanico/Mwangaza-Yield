// Objective-based planning: people don't want "a bond", they want school fees
// covered in 2033, or an income that arrives every month, or to stop working.
// Each planner turns a life goal into a concrete allocation over live paper.

import type { Bond, SecondaryTrade, TBill, RateDecision } from '@/types/bond';
import { computeBondInvestment, getCouponDates } from './financial-engine';
import { buildLadder, type LadderPlan } from './ladder';
import { computeTBill } from './tbills';
import { monthsToTarget } from './progress';
import { analyseRateOutlook, conservativeYield } from './rate-outlook';
import { resolvePrice, type PriceCoverage, type UserPrice } from './prices';

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

// The reader's own price book outranks a published print, which outranks par.
// See `prices.ts` — the ordering is deliberate and the provenance travels with
// the number so no planner can present a placeholder as though it were market.
const priceOf = (b: Bond, secondary: SecondaryTrade[], userPrices: UserPrice[] = []) =>
  resolvePrice(b, secondary, userPrices).price;

/* ------------------------------------------------------------------ FIRE */

// The planning ladder. Long enough that the rungs span a real spread of
// maturities rather than clustering at the short end, and few enough rungs that
// each stays above the 50k step and the bonds' own minimums at ordinary sums.
const LADDER_HORIZON_YEARS = 15;
const LADDER_RUNGS = 5;

export interface FirePlan {
  targetAnnualIncomeKES: number;
  /**
   * The rate the plan is BUILT on: a diversified ladder's blended net yield,
   * marked down for the fall the policy rate has actually made on the record.
   * Every headline figure below uses this one.
   */
  planningNetYield: number;
  /** The same ladder at today's rates — the optimistic end of the range. */
  currentLadderNetYield: number;
  /** Points of assumed rate fall between the two, for the disclosure. */
  downsidePp: number;
  /** Highest single net yield on offer. Reported for context, NOT planned on. */
  bestNetYield: number;
  bestBond: Bond | null;
  /** Capital needed so net coupons alone cover the target, at the plan rate. */
  requiredCapitalKES: number;
  /** The same, if today's rates held — always the smaller of the two. */
  requiredCapitalIfRatesHoldKES: number;
  currentCapitalKES: number;
  incomeFromCurrentKES: number;
  coverageRatio: number;      // 0–1+ of target already funded
  shortfallKES: number;
  /** Years to close the shortfall at the plan rate. The number to trust. */
  yearsToTarget: number | null;
  /** Years if today's rates held. The optimistic end. */
  yearsIfRatesHold: number | null;
  /** How many distinct bonds the planning ladder actually used. */
  ladderRungs: number;
  /** How much of the planning ladder rests on real prices vs the par placeholder. */
  priceCoverage: PriceCoverage;
}

export function planFire(
  bonds: Bond[],
  secondary: SecondaryTrade[],
  targetAnnualIncomeKES: number,
  currentCapitalKES: number,
  monthlyContributionKES: number,
  cbrHistory: RateDecision[] = [],
  userPrices: UserPrice[] = []
): FirePlan {
  // The highest yield on the board, kept for context only. Planning on it was
  // the old behaviour and it is not defensible over a horizon like this: it
  // assumes unlimited quantity of ONE issue, bought at today's price, and
  // reinvested at that same rate for decades. On the live data that was 18.45%
  // against a 16.03% diversified ladder, and it cut the stated journey from 4.4
  // years to 3.6 — an error in the direction that makes someone stop saving
  // early. Under-saving costs the plan; over-saving only costs optionality.
  const ranked = bonds
    .map((bond) => ({ bond, netYTM: computeBondInvestment(bond, 100_000, priceOf(bond, secondary, userPrices)).netYTM }))
    .sort((a, b) => b.netYTM - a.netYTM);
  const best = ranked[0] ?? null;

  // Plan on a portfolio that can actually be built: the same ladder the Ladder
  // Builder would construct, spread across maturity years so no single issue
  // has to absorb everything. This is already what the school-fees planner
  // uses, so FIRE stops being the odd one out.
  //
  // Sized on the capital in play, because the rung minimums bite at small
  // amounts; a nominal million keeps the yield meaningful before any capital
  // has been entered.
  const ladder = buildLadder(
    bonds,
    secondary,
    Math.max(1_000_000, currentCapitalKES),
    LADDER_HORIZON_YEARS,
    LADDER_RUNGS,
    new Date(),
    userPrices
  );
  const currentLadderNetYield = ladder.rungs.length
    ? ladder.blendedNetYTM
    : best?.netYTM ?? 0;

  // Then mark it down by the fall the policy rate has actually made on the
  // record. Held bonds keep their coupon, but an accumulation plan keeps
  // buying, and reinvestment is where a long projection really breaks.
  const outlook = analyseRateOutlook(cbrHistory);
  const planningNetYield = conservativeYield(currentLadderNetYield, outlook);

  const r = planningNetYield / 100;
  const rHold = currentLadderNetYield / 100;

  const requiredCapitalKES = r > 0 ? targetAnnualIncomeKES / r : 0;
  const requiredCapitalIfRatesHoldKES = rHold > 0 ? targetAnnualIncomeKES / rHold : 0;
  const incomeFromCurrentKES = currentCapitalKES * r;
  const shortfallKES = Math.max(0, requiredCapitalKES - currentCapitalKES);

  // Stepped monthly because that is how the contributions are actually made,
  // and it is the same function the progress tracker measures checkpoints
  // against — so a saver is never marked "behind" against a curve that differs
  // from the one their plan was drawn with.
  const months = monthsToTarget(currentCapitalKES, monthlyContributionKES, planningNetYield, requiredCapitalKES);
  const monthsHold = monthsToTarget(currentCapitalKES, monthlyContributionKES, currentLadderNetYield, requiredCapitalIfRatesHoldKES);

  return {
    targetAnnualIncomeKES,
    planningNetYield,
    currentLadderNetYield,
    downsidePp: outlook?.downsidePp ?? 0,
    bestNetYield: best?.netYTM ?? 0,
    bestBond: best?.bond ?? null,
    requiredCapitalKES,
    requiredCapitalIfRatesHoldKES,
    currentCapitalKES,
    incomeFromCurrentKES,
    coverageRatio: requiredCapitalKES > 0 ? currentCapitalKES / requiredCapitalKES : 0,
    shortfallKES,
    yearsToTarget: months === null ? null : months / 12,
    yearsIfRatesHold: monthsHold === null ? null : monthsHold / 12,
    ladderRungs: ladder.rungs.length,
    priceCoverage: ladder.priceCoverage,
  };
}

/* ----------------------------------------------------------- School fees */

/** The form offers 1–8; the planner enforces it so nothing else can exceed it. */
export const MAX_FEE_YEARS = 8;
/** Fees more than a working lifetime away are a typo, not a plan. */
export const MAX_YEARS_AHEAD = 40;

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
  asOf: Date = new Date(),
  userPrices: UserPrice[] = []
): SchoolFeesPlan {
  // Clamped HERE, not only in the form. `min` and `max` on a number input are
  // form-validation hints; typing or pasting past them sets the value anyway.
  // "Years of fees" then drives a loop that allocates a FeeYear and renders a
  // table row per iteration, so a stray 1000000 built a million rows and wedged
  // the tab hard enough that reloading the page timed out. A planner that can
  // be hung by its own arguments is the library's problem, not the form's.
  const years_ = Math.min(MAX_FEE_YEARS, Math.max(1, Math.floor(yearsOfFees) || 1));
  const thisYear = asOf.getFullYear();
  const first_ = Math.min(thisYear + MAX_YEARS_AHEAD, Math.max(thisYear, Math.floor(firstFeeYear) || thisYear));
  yearsOfFees = years_;
  firstFeeYear = first_;

  const lastFeeYear = firstFeeYear + yearsOfFees - 1;
  const horizonYears = Math.max(1, lastFeeYear - asOf.getFullYear() + 1);
  // One rung per fee year: principal should land the year the invoice does.
  const ladder = buildLadder(bonds, secondary, capitalKES, horizonYears, Math.min(6, yearsOfFees), asOf, userPrices);

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
  maxHoldings = 3,
  userPrices: UserPrice[] = []
): IncomePlan {
  // Greedy: repeatedly take the bond that adds the most *new* payout months,
  // breaking ties on net yield. Spreading beats a marginally higher coupon
  // when the point of the money is a monthly income.
  const pool = bonds.map((bond) => ({
    bond,
    months: couponMonths(bond),
    netYTM: computeBondInvestment(bond, 100_000, priceOf(bond, secondary, userPrices)).netYTM,
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
    const r = computeBondInvestment(c.bond, per, priceOf(c.bond, secondary, userPrices));
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
