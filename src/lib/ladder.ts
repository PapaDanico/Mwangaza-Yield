// Bond ladder construction — pure logic over the financial engine.
// Allocates a lump sum across bonds with staggered maturities so coupons and
// redemptions arrive as a predictable net-of-tax income stream.

import type { Bond, SecondaryTrade } from '@/types/bond';
import {
  computeBondInvestment,
  getCouponDates,
  type InvestmentResult,
} from './financial-engine';
import {
  makePriceResolver,
  summarisePriceCoverage,
  type PriceCoverage,
  type ResolvedPrice,
  type UserPrice,
} from './prices';

export interface LadderRung {
  bond: Bond;
  faceValueKES: number;
  price: number;
  /** Where this rung's price came from, so the UI can label the figure. */
  priceInfo: ResolvedPrice;
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
  /** How much of this plan rests on real prices rather than the par placeholder. */
  priceCoverage: PriceCoverage;
}

const STEP = 50_000; // CBK face values move in Ksh 50k increments

/** A bond with its resolved price and net yield — what both selection paths produce. */
interface PricedBond {
  bond: Bond;
  price: number;
  priceInfo: ResolvedPrice;
  netYTM: number;
}

/**
 * Build a ladder: choose up to `maxRungs` bonds maturing within `horizonYears`,
 * spread across distinct maturity years (highest net yield wins a contested
 * year), split `totalKES` equally, rounded down to 50k steps and each bond's
 * own minimum. Prices come from the reader's own price book first, then the
 * latest secondary trade, then par — see `prices.ts` for why that order.
 *
 * CHOOSING THE BONDS YOURSELF
 * ---------------------------
 * Pass `selectedIsins` and those bonds become the ladder exactly, in maturity
 * order, bypassing the automatic pick. This is what lets a reader tailor the
 * plan: the tool's own selection optimises for net yield inside each maturity
 * window, which is a defensible default and frequently not what somebody
 * actually wants — a school fee falls in a particular year, an infrastructure
 * bond is worth holding for the tax exemption even at a lower headline, and a
 * bond already owned should be modelled rather than replaced.
 *
 * Everything downstream is unchanged: the same 50k step, the same per-bond
 * minimum, the same price resolution and the same net-of-tax maths. A hand-
 * built ladder is priced exactly as honestly as a generated one — including
 * dropping a rung whose minimum the split cannot meet.
 *
 * The horizon does NOT filter an explicit selection. If a reader picks a bond
 * maturing beyond it, they have said something more specific than the slider
 * did, and silently discarding it would be the tool overruling the user.
 * Matured paper is still excluded — that is arithmetic, not preference.
 */
export function buildLadder(
  bonds: Bond[],
  secondary: SecondaryTrade[],
  totalKES: number,
  horizonYears: number,
  maxRungs = 5,
  asOf: Date = new Date(),
  userPrices: UserPrice[] = [],
  selectedIsins: string[] = []
): LadderPlan {
  const horizonEnd = new Date(asOf);
  horizonEnd.setFullYear(horizonEnd.getFullYear() + horizonYears);

  const priceInfoOf = makePriceResolver(secondary, userPrices, asOf);

  const priced = (b: Bond) => {
    const priceInfo = priceInfoOf(b);
    return {
      bond: b,
      price: priceInfo.price,
      priceInfo,
      netYTM: computeBondInvestment(b, STEP, priceInfo.price, asOf).netYTM,
    };
  };

  // An explicit selection is honoured as given — see the note above on why the
  // horizon is not applied to it. Duplicates collapse: two rungs of the same
  // bond is one holding, and presenting it as two would double-count the
  // diversification the ladder is for.
  if (selectedIsins.length) {
    const seen = new Set<string>();
    const chosenBonds = selectedIsins
      .filter((isin) => (seen.has(isin) ? false : (seen.add(isin), true)))
      .map((isin) => bonds.find((b) => b.isin === isin))
      .filter((b): b is Bond => Boolean(b) && new Date(b!.maturityDate) > asOf)
      .map(priced)
      .sort((a, x) => a.bond.maturityDate.localeCompare(x.bond.maturityDate));
    return assemble(chosenBonds, totalKES, asOf);
  }

  // Rank candidates by net yield at their price, then keep one per maturity year.
  const candidates = bonds
    .filter((b) => new Date(b.maturityDate) > asOf && new Date(b.maturityDate) <= horizonEnd)
    .map(priced)
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

  return assemble(picked, totalKES, asOf);
}

/**
 * Split capital across chosen rungs and price the whole plan.
 *
 * Shared by both paths on purpose. When the reader hand-picks bonds their
 * ladder must be costed by exactly the same code that costs a generated one —
 * otherwise "what the tool suggests" and "what I chose" become two different
 * kinds of number, and comparing them would mean nothing.
 */
function assemble(
  picked: PricedBond[],
  totalKES: number,
  asOf: Date
): LadderPlan {
  if (!picked.length) {
    return {
      rungs: [], totalCostKES: 0, blendedNetYTM: 0, netAnnualIncomeKES: 0,
      yearlyPayouts: [], unallocatedKES: totalKES,
      priceCoverage: summarisePriceCoverage([]),
    };
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
    priceInfo: c.priceInfo,
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
    priceCoverage: summarisePriceCoverage(rungs.map((r) => r.priceInfo)),
  };
}
