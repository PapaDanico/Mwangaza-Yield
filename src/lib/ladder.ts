// Bond ladder construction — pure logic over the financial engine.
// Allocates a lump sum across bonds with staggered maturities so coupons and
// redemptions arrive as a predictable net-of-tax income stream.

import type { Bond, SecondaryTrade } from '@/types/bond';
import {
  computeBondInvestment,
  getCouponDates,
  type InvestmentResult,
} from './financial-engine';

export interface LadderRung {
  bond: Bond;
  faceValueKES: number;
  price: number;
  result: InvestmentResult;
}

export interface LadderPlan {
  rungs: LadderRung[];
  totalCostKES: number;
  blendedNetYTM: number;
  netAnnualIncomeKES: number;
  /** Net cash received per calendar year (coupons + principal redemptions). */
  yearlyPayouts: { year: number; couponsKES: number; principalKES: number }[];
  unallocatedKES: number;
}

const STEP = 50_000; // CBK face values move in KES 50k increments

/**
 * Build a ladder: choose up to `maxRungs` bonds maturing within `horizonYears`,
 * spread across distinct maturity years (highest net yield wins a contested
 * year), split `totalKES` equally, rounded down to 50k steps and each bond's
 * own minimum. Prices come from the latest secondary trade, else par.
 */
export function buildLadder(
  bonds: Bond[],
  secondary: SecondaryTrade[],
  totalKES: number,
  horizonYears: number,
  maxRungs = 5,
  asOf: Date = new Date()
): LadderPlan {
  const horizonEnd = new Date(asOf);
  horizonEnd.setFullYear(horizonEnd.getFullYear() + horizonYears);

  const priceOf = (b: Bond) => secondary.find((t) => t.isin === b.isin)?.price ?? 100;

  // Rank candidates by net yield at their price, then keep one per maturity year.
  const candidates = bonds
    .filter((b) => new Date(b.maturityDate) > asOf && new Date(b.maturityDate) <= horizonEnd)
    .map((b) => ({ bond: b, price: priceOf(b), netYTM: computeBondInvestment(b, STEP, priceOf(b), asOf).netYTM }))
    .sort((a, x) => x.netYTM - a.netYTM);

  // Spread rungs ACROSS the horizon: split it into `maxRungs` equal windows and
  // take the best net yield in each. Taking the first N by date instead would
  // clump every rung at the short end and ignore the horizon the user set.
  const spanMs = horizonEnd.getTime() - asOf.getTime();
  const chosen = new Map<number, (typeof candidates)[number]>();
  for (const c of candidates) {
    const t = new Date(c.bond.maturityDate).getTime() - asOf.getTime();
    const bucket = Math.min(maxRungs - 1, Math.floor((t / spanMs) * maxRungs));
    const held = chosen.get(bucket);
    if (!held || c.netYTM > held.netYTM) chosen.set(bucket, c);
  }
  const picked = Array.from(chosen.values());

  // Buckets can be empty when the market has no paper in that window (Kenya's
  // curve is sparse at the short end). Backfill up to maxRungs with the best
  // remaining yields, still one bond per maturity year.
  if (picked.length < maxRungs) {
    const takenYears = new Set(picked.map((c) => new Date(c.bond.maturityDate).getFullYear()));
    for (const c of candidates) {
      if (picked.length >= maxRungs) break;
      const y = new Date(c.bond.maturityDate).getFullYear();
      if (takenYears.has(y)) continue;
      takenYears.add(y);
      picked.push(c);
    }
  }
  picked.sort((a, x) => a.bond.maturityDate.localeCompare(x.bond.maturityDate));

  if (!picked.length) {
    return { rungs: [], totalCostKES: 0, blendedNetYTM: 0, netAnnualIncomeKES: 0, yearlyPayouts: [], unallocatedKES: totalKES };
  }

  // Equal split, floored to 50k and each bond's minimum; drop rungs that
  // can't meet their minimum, re-splitting across the survivors.
  let pool = picked;
  let per = 0;
  for (;;) {
    per = Math.floor(totalKES / pool.length / STEP) * STEP;
    const survivors = pool.filter((c) => per >= c.bond.minInvestmentKES);
    if (survivors.length === pool.length || survivors.length === 0) {
      pool = survivors;
      break;
    }
    pool = survivors;
  }

  const rungs: LadderRung[] = pool.map((c) => ({
    bond: c.bond,
    faceValueKES: per,
    price: c.price,
    result: computeBondInvestment(c.bond, per, c.price, asOf),
  }));

  const totalCostKES = rungs.reduce((s, r) => s + r.result.settlementCostKES, 0);
  const netAnnualIncomeKES = rungs.reduce((s, r) => s + r.result.netAnnualIncomeKES, 0);
  const blendedNetYTM = totalCostKES > 0
    ? rungs.reduce((s, r) => s + r.result.netYTM * r.result.settlementCostKES, 0) / totalCostKES
    : 0;

  // Yearly net cash: taxed coupons on each rung's schedule, principal at maturity.
  const years = new Map<number, { couponsKES: number; principalKES: number }>();
  for (const r of rungs) {
    const freq = r.bond.couponFrequencyPerYear || 2;
    const dates = getCouponDates(new Date(r.bond.issueDate), new Date(r.bond.maturityDate), freq)
      .filter((d) => d > asOf);
    for (const d of dates) {
      const y = d.getFullYear();
      const slot = years.get(y) ?? { couponsKES: 0, principalKES: 0 };
      slot.couponsKES += r.result.netCouponPerPeriodKES;
      years.set(y, slot);
    }
    const my = new Date(r.bond.maturityDate).getFullYear();
    const slot = years.get(my) ?? { couponsKES: 0, principalKES: 0 };
    slot.principalKES += r.faceValueKES;
    years.set(my, slot);
  }
  const yearlyPayouts = Array.from(years.entries())
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => a.year - b.year);

  return {
    rungs,
    totalCostKES,
    blendedNetYTM,
    netAnnualIncomeKES,
    yearlyPayouts,
    unallocatedKES: Math.max(0, totalKES - rungs.length * per),
  };
}
