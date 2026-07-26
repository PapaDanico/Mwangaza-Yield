// Selling a bond — the side of the trade nobody models for the retail holder.
//
// A broker sends a pricing sheet: issue, coupon, value date, a yield, a dirty
// price, a consideration, and some charges. Every figure on it is about the
// TRANSACTION. Not one of them answers the question the seller actually has,
// which is whether to do it at all.
//
// What the sheet does not say:
//
//   * What you are really selling at. The quoted yield is before the broker's
//     commission and the CMA/NSE/CDSC levies. Those come out of your proceeds,
//     so the yield you actually realise is worse than the one on the sheet.
//   * What you must earn next to stand still. Selling is only neutral if the
//     money can be redeployed at the same rate. That is a number, and it can
//     be computed exactly.
//   * That an infrastructure bond cannot be replaced by an ordinary one at the
//     same headline yield. IFB coupons are free of withholding tax; FXD coupons
//     are not. Swapping 12.5% tax-free for 13% taxable is a LOSS of about a
//     point, and the sheet will never mention it because it is not the broker's
//     job to. This is the single most expensive mistake available to a Kenyan
//     bond seller, and it is pure arithmetic to avoid.
//
// Everything here works from the reader's own quote. No market data is fetched,
// looked up or required — the numbers come off the sheet in front of them.

import type { Bond } from '@/types/bond';
import { determineWHTRate, getCouponDates, getLastCouponDate } from './financial-engine';

/** 364-day year, 182-day coupon period — the convention Kenyan paper is built on. */
const YEAR_DAYS = 364;
const PERIOD_DAYS = 182;
const DAY_MS = 86_400_000;

/**
 * A partial principal repayment before maturity.
 *
 * Amortising infrastructure bonds are common in Kenya and they change the
 * price materially: once part of the principal is returned, every later coupon
 * is paid on a smaller balance. Ignoring it overstates the bond.
 */
export interface AmortisationStep {
  /** ISO date the principal fraction is repaid. */
  date: string;
  /** Fraction of ORIGINAL face repaid on that date, 0–1. */
  fraction: number;
}

export interface SaleQuote {
  faceValueKES: number;
  /** Value date / settlement date from the broker's sheet. */
  settlementDate: string;
  /** Clean price per 100 as quoted. Supply this or `dirtyPrice`. */
  cleanPrice?: number;
  /** Dirty price per 100 as quoted (clean + accrued). */
  dirtyPrice?: number;
  /** The yield the broker quoted, for cross-checking. Optional. */
  quotedYTM?: number;
  commissionKES: number;
  leviesKES: number;
  /** Known partial redemptions. Empty for a bullet bond. */
  amortisation?: AmortisationStep[];
}

export interface CashflowRow {
  date: string;
  couponKES: number;
  principalKES: number;
  /** Coupon net of withholding tax — equal to gross for a tax-exempt IFB. */
  netCouponKES: number;
}

export interface SaleAnalysis {
  /* ---- what the sheet says, recomputed independently ---- */
  daysAccrued: number;
  accruedInterestKES: number;
  accruedPer100: number;
  cleanPrice: number;
  dirtyPrice: number;
  considerationKES: number;

  /* ---- what actually reaches you ---- */
  totalChargesKES: number;
  netProceedsKES: number;
  /** Charges expressed per 100 face, so they can be compared to a price. */
  chargesPer100: number;

  /* ---- the decision numbers ---- */
  /**
   * The yield you are REALLY selling at: the discount rate that equates the
   * cash flows you are giving up to the money you actually receive. Always
   * worse than the quoted yield, because charges come out of the proceeds.
   */
  effectiveSaleYield: number;
  /** Quoted minus effective, in percentage points. What the charges cost you. */
  chargeDragPp: number;
  /**
   * What a REPLACEMENT bond must yield to leave you no worse off.
   * For a tax-exempt holding this is grossed up: a taxable bond has to clear a
   * higher bar to deliver the same money.
   */
  breakEvenNetYield: number;
  breakEvenTaxableGrossYield: number;
  whtRateOnReplacement: number;

  /* ---- what you are giving up ---- */
  cashflows: CashflowRow[];
  totalGrossCouponsKES: number;
  totalNetCouponsKES: number;
  principalReturnedKES: number;
  /** Everything still owed to you if you simply held: net coupons + principal. */
  totalIfHeldKES: number;
  /** Net proceeds as a share of what holding would eventually pay. */
  proceedsVsHoldRatio: number;

  /* ---- honesty about the inputs ---- */
  /** True when a quoted YTM was supplied and our price does NOT reproduce it. */
  quoteDisagrees: boolean;
  /** Our dirty price at the broker's quoted yield, when one was given. */
  ourDirtyAtQuotedYTM: number | null;
  amortisationApplied: boolean;
}

/* ------------------------------------------------------------------ dates */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

/**
 * Coupon dates still to come, delegated to the engine rather than re-derived.
 *
 * An earlier version of this file stepped 182 days from issue and kept dates
 * `<= maturity`. On all 58 bonds we currently hold that is identical to the
 * engine's answer — every one of them has a maturity that is an exact 182-day
 * multiple from issue, so the last step lands on redemption day. But it is only
 * identical BY LUCK OF THE DATASET. Issue one bond with a stub period and the
 * final coupon — the one paid at redemption — silently disappears from the
 * schedule, and a sale looks better than it is.
 *
 * `getCouponDates` already guards that case, and its own comment records the
 * money-losing bug that put the guard there. Re-deriving the schedule beside it
 * meant maintaining two answers to one question and inheriting none of what the
 * first one had already learned.
 */
export function remainingCouponDates(bond: Bond, settlement: Date): Date[] {
  return getCouponDates(
    new Date(bond.issueDate),
    new Date(bond.maturityDate),
    bond.couponFrequencyPerYear || 2
  ).filter((d) => d > settlement);
}

/**
 * Outstanding principal fraction on a given date, after any amortisation that
 * has already happened by then.
 */
function balanceOn(date: Date, amortisation: AmortisationStep[]): number {
  let bal = 1;
  for (const step of amortisation) {
    if (new Date(step.date) <= date) bal -= step.fraction;
  }
  return Math.max(0, bal);
}

/* -------------------------------------------------------------- cashflows */

/**
 * Every payment still owed on the bond after settlement, with principal
 * repayments placed on their amortisation dates and the balance at maturity.
 */
export function buildCashflows(
  bond: Bond,
  faceValueKES: number,
  settlement: Date,
  amortisation: AmortisationStep[] = []
): CashflowRow[] {
  const wht = determineWHTRate(bond);
  const dates = remainingCouponDates(bond, settlement);
  const maturity = new Date(bond.maturityDate);
  const fullPeriodCoupon = (faceValueKES * bond.couponRate) / 100 / (bond.couponFrequencyPerYear || 2);

  const rows: CashflowRow[] = dates.map((d) => {
    // The coupon is paid on the balance outstanding for that period, i.e. the
    // balance the DAY BEFORE any repayment landing on the same date.
    const bal = balanceOn(new Date(d.getTime() - DAY_MS), amortisation);
    const gross = fullPeriodCoupon * bal;
    const principal = amortisation
      .filter((s) => iso(new Date(s.date)) === iso(d) || (new Date(s.date) > settlement && sameCouponSlot(new Date(s.date), d)))
      .reduce((sum, s) => sum + s.fraction * faceValueKES, 0);
    return {
      date: iso(d),
      couponKES: gross,
      principalKES: principal,
      netCouponKES: gross * (1 - wht),
    };
  });

  // Whatever principal has not amortised comes back at maturity.
  const finalBalance = balanceOn(maturity, amortisation);
  const last = rows[rows.length - 1];
  if (last && last.date === iso(maturity)) last.principalKES += finalBalance * faceValueKES;
  else if (finalBalance > 0) {
    rows.push({ date: iso(maturity), couponKES: 0, principalKES: finalBalance * faceValueKES, netCouponKES: 0 });
  }
  return rows;
}

/** An amortisation date is settled on the coupon date it falls in or on. */
function sameCouponSlot(amortDate: Date, couponDate: Date): boolean {
  const diff = daysBetween(amortDate, couponDate);
  return diff >= 0 && diff < PERIOD_DAYS;
}

/* ----------------------------------------------------------------- prices */

/** Present value per 100 face of a cash-flow stream at an annual nominal yield. */
function pvPer100(
  cashflows: CashflowRow[],
  faceValueKES: number,
  settlement: Date,
  annualYieldPct: number,
  freq: number,
  useNet: boolean
): number {
  const r = annualYieldPct / 100 / freq;
  let pv = 0;
  for (const cf of cashflows) {
    const t = daysBetween(settlement, new Date(cf.date)) / PERIOD_DAYS;
    const amount = (useNet ? cf.netCouponKES : cf.couponKES) + cf.principalKES;
    pv += amount / Math.pow(1 + r, t);
  }
  return (pv / faceValueKES) * 100;
}

/** Solve the annual nominal yield that makes a stream worth `targetPer100`. */
function solveYield(
  cashflows: CashflowRow[],
  faceValueKES: number,
  settlement: Date,
  targetPer100: number,
  freq: number,
  useNet: boolean
): number {
  let lo = 0.0001, hi = 200;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pvPer100(cashflows, faceValueKES, settlement, mid, freq, useNet) > targetPer100) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* --------------------------------------------------------------- analysis */

/**
 * Evaluate a sale from the broker's own sheet.
 *
 * Recomputes the quote's arithmetic independently rather than trusting it —
 * the point is to give the reader a second opinion, and a second opinion that
 * simply echoes the first is worthless.
 */
export function analyseSale(bond: Bond, quote: SaleQuote): SaleAnalysis {
  const settlement = new Date(quote.settlementDate);
  const face = quote.faceValueKES;
  const freq = bond.couponFrequencyPerYear || 2;
  const amortisation = quote.amortisation ?? [];

  // Accrued interest, on the convention the market actually uses. The last
  // coupon date comes from the engine for the same reason the schedule does.
  const lastCoupon = getLastCouponDate(bond, settlement);
  const daysAccrued = daysBetween(lastCoupon, settlement);
  const balNow = balanceOn(settlement, amortisation);
  const fullPeriodCoupon = (face * bond.couponRate) / 100 / freq;
  const accruedInterestKES = fullPeriodCoupon * balNow * (daysAccrued / PERIOD_DAYS);
  const accruedPer100 = (accruedInterestKES / face) * 100;

  const cleanPrice = quote.cleanPrice ?? (quote.dirtyPrice ?? 0) - accruedPer100;
  const dirtyPrice = quote.dirtyPrice ?? cleanPrice + accruedPer100;
  const considerationKES = (face * dirtyPrice) / 100;

  const totalChargesKES = quote.commissionKES + quote.leviesKES;
  const netProceedsKES = considerationKES - totalChargesKES;
  const chargesPer100 = (totalChargesKES / face) * 100;

  const cashflows = buildCashflows(bond, face, settlement, amortisation);

  // What you are really selling at. Gross coupons, because the yield on the
  // sheet is a gross yield and the comparison has to be like for like.
  const quotedEquivalentYield = solveYield(cashflows, face, settlement, dirtyPrice, freq, false);
  const effectiveSaleYield = solveYield(
    cashflows, face, settlement, (netProceedsKES / face) * 100, freq, false);
  // Charges reduce the proceeds, so the same cash flows change hands for less
  // money — which is arithmetically identical to selling at a HIGHER yield.
  // Higher is worse for the seller, so the drag is effective minus quoted, not
  // the other way round.
  const chargeDragPp = effectiveSaleYield - quotedEquivalentYield;

  // What a replacement has to deliver. For a tax-exempt bond the coupons you
  // are giving up arrive whole, so the honest bar is the NET yield — and a
  // taxable replacement has to gross that up to clear it.
  const breakEvenNetYield = solveYield(
    cashflows, face, settlement, (netProceedsKES / face) * 100, freq, true);
  // Replacement is assumed to be ordinary paper of similar tenor.
  const whtRateOnReplacement = determineWHTRate({ taxExempt: false, tenorYears: bond.tenorYears });
  const breakEvenTaxableGrossYield = breakEvenNetYield / (1 - whtRateOnReplacement);

  const totalGrossCouponsKES = cashflows.reduce((s, c) => s + c.couponKES, 0);
  const totalNetCouponsKES = cashflows.reduce((s, c) => s + c.netCouponKES, 0);
  const principalReturnedKES = cashflows.reduce((s, c) => s + c.principalKES, 0);
  const totalIfHeldKES = totalNetCouponsKES + principalReturnedKES;

  // Does our arithmetic reproduce the broker's yield? A disagreement is worth
  // surfacing rather than hiding: it usually means the sheet is pricing a
  // schedule we do not hold — an amortisation we do not know about is the
  // common cause, and it moves the price by more than the charges do.
  let ourDirtyAtQuotedYTM: number | null = null;
  let quoteDisagrees = false;
  if (quote.quotedYTM !== undefined) {
    ourDirtyAtQuotedYTM = pvPer100(cashflows, face, settlement, quote.quotedYTM, freq, false);
    quoteDisagrees = Math.abs(ourDirtyAtQuotedYTM - dirtyPrice) > 0.05;
  }

  return {
    daysAccrued,
    accruedInterestKES,
    accruedPer100,
    cleanPrice,
    dirtyPrice,
    considerationKES,
    totalChargesKES,
    netProceedsKES,
    chargesPer100,
    effectiveSaleYield,
    chargeDragPp,
    breakEvenNetYield,
    breakEvenTaxableGrossYield,
    whtRateOnReplacement,
    cashflows,
    totalGrossCouponsKES,
    totalNetCouponsKES,
    principalReturnedKES,
    totalIfHeldKES,
    proceedsVsHoldRatio: totalIfHeldKES > 0 ? netProceedsKES / totalIfHeldKES : 0,
    quoteDisagrees,
    ourDirtyAtQuotedYTM,
    amortisationApplied: amortisation.length > 0,
  };
}

/* ------------------------------------------------- can you actually replace it? */

export interface Replacement {
  bond: Bond;
  /** Net-of-tax yield at the price used. */
  netYTM: number;
  /** Percentage points better (+) or worse (−) than the break-even. */
  gapPp: number;
  beatsBreakEven: boolean;
}

/**
 * The question that decides the trade: is there anything to buy instead?
 *
 * Selling is not a decision about a price, it is a decision about a swap. A
 * seller who cannot name what they are buying next is not selling, they are
 * just stopping — and for a tax-free bond at a good coupon there is very often
 * nothing on the board that replaces it. Saying so plainly is the most useful
 * thing this app can do at the moment somebody is about to sign.
 */
export function findReplacements(
  bonds: Bond[],
  breakEvenNetYield: number,
  priceOf: (b: Bond) => number,
  computeNetYTM: (b: Bond, price: number) => number,
  excludeIsin?: string,
  asOf: Date = new Date()
): Replacement[] {
  return bonds
    .filter((b) => b.isin !== excludeIsin && new Date(b.maturityDate) > asOf)
    .map((b) => {
      const netYTM = computeNetYTM(b, priceOf(b));
      return { bond: b, netYTM, gapPp: netYTM - breakEvenNetYield, beatsBreakEven: netYTM > breakEvenNetYield };
    })
    .sort((a, b) => b.netYTM - a.netYTM);
}

/**
 * One sentence a reader can act on. Deliberately blunt about the tax swap,
 * because that is the trap that costs the most and shows up the least.
 */
export function verdict(analysis: SaleAnalysis, bond: Bond, best: Replacement | null): string {
  const be = analysis.breakEvenNetYield.toFixed(2);
  if (!best) {
    return `You would need something paying more than ${be}% net to be better off. `
      + 'We cannot see what else you are considering, so compare against that figure.';
  }
  if (bond.taxExempt && !best.bond.taxExempt) {
    return `This is a tax-free bond. To replace ${be}% net with taxed paper you need `
      + `${analysis.breakEvenTaxableGrossYield.toFixed(2)}% gross — the best on the board is `
      + `${best.bond.issueCode} at ${best.netYTM.toFixed(2)}% net`
      + (best.beatsBreakEven ? ', which clears it.' : ', which does not. Selling here costs you income.');
  }
  return best.beatsBreakEven
    ? `${best.bond.issueCode} at ${best.netYTM.toFixed(2)}% net clears your ${be}% break-even by `
      + `${best.gapPp.toFixed(2)} points.`
    : `Nothing on the board clears your ${be}% break-even — the best is ${best.bond.issueCode} at `
      + `${best.netYTM.toFixed(2)}% net, ${Math.abs(best.gapPp).toFixed(2)} points short.`;
}
