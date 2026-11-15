// Analytical layers over a built ladder: what each rung is, what the whole
// ladder is exposed to, and how trustworthy the inputs are.
//
// This composes code that already exists and adds only what was missing:
//   - price sensitivity   from `rate-shocks.ts` (exact repricing, gross yields)
//   - curve position      from `carry-rolldown.ts` (`fitCurve`, `yieldAt`)
//   - the ladder itself   from `ladder.ts`
// New here: concentration, tax mix, coupon-month coverage, the share of the
// money that comes back soon enough to have to be reinvested, price-quality
// grading, real yield, and the plain-language flags built from those.
//
// WHAT THIS IS NOT. Nothing here is a forecast or a recommendation. Each
// figure is either a measurement of the plan as built (maturity shares, tax
// mix, coupon months) or a stated scenario (a 100bp parallel move). Flags use
// fixed, published thresholds so the same ladder always gets the same flags,
// and they say what is true, never what to buy.

import type { Bond } from '@/types/bond';
import { getCouponDates } from './financial-engine';
import { dirtyPriceAtYield, rateShocks } from './rate-shocks';
import { fitCurve, yieldAt, type CurveFit } from './carry-rolldown';
import type { LadderPlan, LadderRung } from './ladder';

const YEAR_MS = 365.25 * 86_400_000;

/** Thresholds behind the flags. Exported so the page can state them and a test can pin them. */
export const THRESHOLDS = {
  /** One maturity year holding more than this share of the money. */
  maturityYearShare: 0.4,
  /** One bond category (FXD, IFB, SDB) holding more than this share. */
  categoryShare: 0.7,
  /** Modified duration above this many years. */
  longDurationYears: 6,
  /** Share of principal back within 24 months above this. */
  soonShare: 0.5,
  /** A yield older than this many days is not a current reading. */
  staleYieldDays: 180,
  /** Gap to the fitted curve worth mentioning, in basis points. */
  curveGapBp: 50,
} as const;

export type PriceQuality = 'your price' | 'market price' | 'placeholder';

export interface RungAnalysis {
  issueCode: string;
  isin: string;
  category: string;
  taxExempt: boolean;
  maturityDate: string;
  yearsLeft: number;
  /** Share of the ladder's cost. */
  costShare: number;
  netYTM: number;
  grossYTM: number;
  /** Net yield rises to this, grossed up at 15%, for a tax-exempt bond: what a taxable bond must pay to match it. Null for taxable bonds. */
  taxableEquivalentPct: number | null;
  /** Percent change in price for a 1% rise in yield, from exact repricing (positive number = loss). */
  modifiedDuration: number | null;
  /** Change in market value, in KSh, if yields move +100bp / -100bp in parallel. */
  valueChangeUp100KES: number | null;
  valueChangeDown100KES: number | null;
  /** Gross yield less the fitted curve at this remaining life, in bp. Null when not comparable (tax-exempt, outside the fitted range, no curve). */
  gapToCurveBp: number | null;
  priceQuality: PriceQuality;
  priceAgeDays: number | null;
  /** Age of the auction yield this bond's reference yield came from. Null when unrecorded. */
  yieldAgeDays: number | null;
}

export interface Flag {
  /** `watch` is something a reader should look at before relying on the plan; `note` is context. */
  level: 'watch' | 'note';
  topic: 'concentration' | 'rate risk' | 'reinvestment' | 'income' | 'data' | 'tax' | 'real return' | 'curve';
  text: string;
}

export interface PortfolioAnalysis {
  /** Principal-weighted average years to maturity. */
  weightedAvgLifeYears: number;
  /** Cost-weighted modified duration. */
  modifiedDuration: number | null;
  valueChangeUp100KES: number | null;
  valueChangeDown100KES: number | null;
  valueChangeUp100Pct: number | null;
  /** Share of cost by maturity year, largest first, and the Herfindahl index of those shares (1 = one year, 1/n = even). */
  maturityYearShares: { year: number; share: number }[];
  maturityHHI: number;
  /** Equivalent number of equally-sized maturity years (1 / HHI). */
  effectiveMaturityYears: number;
  categoryShares: { category: string; share: number }[];
  taxExemptShare: number;
  /** Calendar months (1-12) in which at least one coupon arrives over the next twelve months. */
  couponMonths: number[];
  /** Share of principal returning within 24 months. */
  returnsWithin24MonthsShare: number;
  /** Net yield less inflation, if an inflation figure was supplied. */
  realNetYieldPct: number | null;
  /** Fitted-curve quality, when a curve was available. */
  curve: { n: number; rmseBp: number } | null;
  priceMix: Record<PriceQuality, number>;
}

export interface LadderAnalysis {
  rungs: RungAnalysis[];
  portfolio: PortfolioAnalysis;
  flags: Flag[];
}

const yearsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / YEAR_MS;
const pct = (x: number, dp = 0) => `${(x * 100).toFixed(dp)}%`;

function quality(r: LadderRung): PriceQuality {
  return r.priceInfo.source === 'user' ? 'your price' : r.priceInfo.source === 'market' ? 'market price' : 'placeholder';
}

/** Modified duration by exact repricing a basis point either side of the anchor. */
function modifiedDurationOf(bond: Bond, settlement: Date, dirtyNow: number): number | null {
  const rows = rateShocks(bond, settlement, dirtyNow, [-1, 1]);
  if (!rows) return null;
  const down = rows.rows.find((r) => r.shockBp === -1);
  const up = rows.rows.find((r) => r.shockBp === 1);
  if (!down || !up) return null;
  return (down.dirtyPrice - up.dirtyPrice) / (2 * dirtyNow * 0.0001);
}

export function analyseLadder(
  plan: LadderPlan,
  ctx: {
    asOf: Date;
    /** Every bond, used only to fit the curve a rung is compared against. */
    universe: Bond[];
    /** Latest published headline inflation, percent. Optional. */
    inflationPct?: number | null;
  }
): LadderAnalysis {
  const { asOf } = ctx;
  const rungs = plan.rungs;
  const totalCost = plan.totalCostKES;
  const totalFace = rungs.reduce((s, r) => s + r.faceValueKES, 0);
  const fit: CurveFit | null = fitCurve(ctx.universe, asOf);

  const rows: RungAnalysis[] = rungs.map((r) => {
    const b = r.bond;
    const yearsLeft = yearsBetween(asOf, new Date(b.maturityDate));
    const dirtyNow = r.result.dirtyPrice;
    const dur = modifiedDurationOf(b, asOf, dirtyNow);
    const shocks = rateShocks(b, asOf, dirtyNow, [-100, 100]);
    const up = shocks?.rows.find((x) => x.shockBp === 100);
    const down = shocks?.rows.find((x) => x.shockBp === -100);
    const cost = r.result.settlementCostKES;
    const curveY = fit && !b.taxExempt && (b.category === 'FXD' || b.category === 'SDB') ? yieldAt(fit, yearsLeft) : null;
    return {
      issueCode: b.issueCode,
      isin: b.isin,
      category: b.category,
      taxExempt: Boolean(b.taxExempt),
      maturityDate: b.maturityDate,
      yearsLeft,
      costShare: totalCost > 0 ? cost / totalCost : 0,
      netYTM: r.result.netYTM,
      grossYTM: r.result.grossYTM,
      taxableEquivalentPct: b.taxExempt ? r.result.netYTM / (1 - 0.15) : null,
      modifiedDuration: dur,
      valueChangeUp100KES: up ? (up.changePct / 100) * cost : null,
      valueChangeDown100KES: down ? (down.changePct / 100) * cost : null,
      gapToCurveBp: curveY == null ? null : (r.result.grossYTM - curveY) * 100,
      priceQuality: quality(r),
      priceAgeDays: r.priceInfo.ageDays,
      yieldAgeDays: b.ytmAsOf ? Math.max(0, Math.round((asOf.getTime() - new Date(b.ytmAsOf).getTime()) / 86_400_000)) : null,
    };
  });

  // ---- portfolio ---------------------------------------------------------
  const wal = totalFace > 0
    ? rungs.reduce((s, r) => s + r.faceValueKES * yearsBetween(asOf, new Date(r.bond.maturityDate)), 0) / totalFace
    : 0;

  const durRows = rows.filter((r) => r.modifiedDuration != null);
  const durWeight = durRows.reduce((s, r) => s + r.costShare, 0);
  const modifiedDuration = durRows.length && durWeight > 0
    ? durRows.reduce((s, r) => s + (r.modifiedDuration as number) * r.costShare, 0) / durWeight
    : null;
  const sumOrNull = (key: 'valueChangeUp100KES' | 'valueChangeDown100KES') =>
    rows.every((r) => r[key] != null) && rows.length ? rows.reduce((s, r) => s + (r[key] as number), 0) : null;
  const up100 = sumOrNull('valueChangeUp100KES');
  const down100 = sumOrNull('valueChangeDown100KES');

  const yearShare = new Map<number, number>();
  const catShare = new Map<string, number>();
  for (const r of rows) {
    const y = new Date(r.maturityDate).getFullYear();
    yearShare.set(y, (yearShare.get(y) ?? 0) + r.costShare);
    catShare.set(r.category, (catShare.get(r.category) ?? 0) + r.costShare);
  }
  const maturityYearShares = [...yearShare.entries()].map(([year, share]) => ({ year, share })).sort((a, b) => b.share - a.share);
  const hhi = maturityYearShares.reduce((s, x) => s + x.share * x.share, 0);

  const yearAhead = new Date(asOf);
  yearAhead.setFullYear(yearAhead.getFullYear() + 1);
  const months = new Set<number>();
  for (const r of rungs) {
    for (const d of getCouponDates(new Date(r.bond.issueDate), new Date(r.bond.maturityDate), r.bond.couponFrequencyPerYear || 2)) {
      if (d > asOf && d <= yearAhead) months.add(d.getMonth() + 1);
    }
  }
  const twoYears = new Date(asOf);
  twoYears.setFullYear(twoYears.getFullYear() + 2);
  const soon = totalFace > 0
    ? rungs.filter((r) => new Date(r.bond.maturityDate) <= twoYears).reduce((s, r) => s + r.faceValueKES, 0) / totalFace
    : 0;

  const infl = ctx.inflationPct;
  const realNet = infl != null && Number.isFinite(infl) && rungs.length
    ? ((1 + plan.blendedNetYTM / 100) / (1 + infl / 100) - 1) * 100
    : null;

  const priceMix: Record<PriceQuality, number> = { 'your price': 0, 'market price': 0, placeholder: 0 };
  for (const r of rows) priceMix[r.priceQuality] += 1;

  const portfolio: PortfolioAnalysis = {
    weightedAvgLifeYears: wal,
    modifiedDuration,
    valueChangeUp100KES: up100,
    valueChangeDown100KES: down100,
    valueChangeUp100Pct: up100 != null && totalCost > 0 ? (up100 / totalCost) * 100 : null,
    maturityYearShares,
    maturityHHI: hhi,
    effectiveMaturityYears: hhi > 0 ? 1 / hhi : 0,
    categoryShares: [...catShare.entries()].map(([category, share]) => ({ category, share })).sort((a, b) => b.share - a.share),
    taxExemptShare: rows.filter((r) => r.taxExempt).reduce((s, r) => s + r.costShare, 0),
    couponMonths: [...months].sort((a, b) => a - b),
    returnsWithin24MonthsShare: soon,
    realNetYieldPct: realNet,
    curve: fit ? { n: fit.n, rmseBp: fit.rmseBp } : null,
    priceMix,
  };

  return { rungs: rows, portfolio, flags: flagsFor(rows, portfolio) };
}

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function flagsFor(rows: RungAnalysis[], p: PortfolioAnalysis): Flag[] {
  const out: Flag[] = [];
  if (!rows.length) return out;
  const T = THRESHOLDS;

  const top = p.maturityYearShares[0];
  if (top && rows.length > 1 && top.share > T.maturityYearShare) {
    out.push({ level: 'watch', topic: 'concentration', text: `${pct(top.share)} of the money comes back in ${top.year}. A ladder is meant to spread that; a single year this large means a single reinvestment decision.` });
  }
  const topCat = p.categoryShares[0];
  if (topCat && rows.length > 1 && topCat.share > T.categoryShare) {
    out.push({ level: 'note', topic: 'concentration', text: `${pct(topCat.share)} of the ladder is one kind of bond (${topCat.category}), so it shares that kind's tax treatment and liquidity.` });
  }

  if (p.modifiedDuration != null && p.modifiedDuration > T.longDurationYears && p.valueChangeUp100Pct != null) {
    out.push({ level: 'note', topic: 'rate risk', text: `Modified duration is ${p.modifiedDuration.toFixed(1)} years: a 1 percentage point rise in yields would cut the market value by about ${Math.abs(p.valueChangeUp100Pct).toFixed(1)}%. That only matters if you sell before maturity; held to maturity the redemption is unchanged.` });
  }

  if (p.returnsWithin24MonthsShare > T.soonShare) {
    out.push({ level: 'note', topic: 'reinvestment', text: `${pct(p.returnsWithin24MonthsShare)} of the principal returns within 24 months and will have to be reinvested at whatever rates are offered then. The plan does not assume what those will be.` });
  }

  const missing = MONTH.filter((_, i) => !p.couponMonths.includes(i + 1));
  if (missing.length > 0 && missing.length < 12) {
    out.push({ level: 'note', topic: 'income', text: `Coupons arrive in ${p.couponMonths.length} of the next 12 months. No coupon in ${missing.length <= 6 ? missing.join(', ') : `${missing.length} months`}. The "smooth income" objective trades a little yield to close such gaps.` });
  }

  const placeholders = rows.filter((r) => r.priceQuality === 'placeholder').length;
  if (placeholders > 0) {
    out.push({ level: 'watch', topic: 'data', text: `${placeholders} of ${rows.length} rungs are priced at par, a placeholder and not a quote. Their yields are indicative until you enter the price you were offered.` });
  }
  const stale = rows.filter((r) => r.yieldAgeDays != null && r.yieldAgeDays > T.staleYieldDays).length;
  if (stale > 0) {
    out.push({ level: 'note', topic: 'data', text: `${stale} of ${rows.length} bonds were last auctioned more than ${T.staleYieldDays} days ago, so their reference yield is not a current market reading.` });
  }

  const ex = rows.filter((r) => r.taxExempt && r.taxableEquivalentPct != null);
  if (ex.length > 0) {
    const best = ex.reduce((a, b) => ((a.taxableEquivalentPct as number) > (b.taxableEquivalentPct as number) ? a : b));
    out.push({ level: 'note', topic: 'tax', text: `${best.issueCode} is tax-exempt: its ${best.netYTM.toFixed(2)}% is the same as ${(best.taxableEquivalentPct as number).toFixed(2)}% on a taxable bond at 15% withholding. Compare it on that basis.` });
  }

  if (p.realNetYieldPct != null) {
    out.push({
      level: p.realNetYieldPct < 0 ? 'watch' : 'note',
      topic: 'real return',
      text: p.realNetYieldPct < 0
        ? `After tax the blended yield is below the latest published inflation by ${Math.abs(p.realNetYieldPct).toFixed(1)} points, so purchasing power would fall if inflation stayed there.`
        : `After tax the blended yield is ${p.realNetYieldPct.toFixed(1)} points above the latest published inflation. Inflation is not forecast; this is today's reading held flat.`,
    });
  }

  const wide = rows.filter((r) => r.gapToCurveBp != null && Math.abs(r.gapToCurveBp) >= T.curveGapBp);
  if (wide.length > 0 && p.curve) {
    const names = wide.slice(0, 3).map((r) => `${r.issueCode} (${(r.gapToCurveBp as number) > 0 ? '+' : ''}${Math.round(r.gapToCurveBp as number)}bp)`).join(', ');
    out.push({ level: 'note', topic: 'curve', text: `Against a curve fitted to the latest taxable auctions (${p.curve.n} bonds, fit error ${Math.round(p.curve.rmseBp)}bp), ${names} sit well away from it. A gap can reflect age, size or liquidity as much as value; it is not a signal to buy or avoid.` });
  }

  return out;
}

/** Exact dirty price at a yield, re-exported so callers need one import for scenario work. */
export { dirtyPriceAtYield };
