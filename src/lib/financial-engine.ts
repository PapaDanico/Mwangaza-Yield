// Pure financial math for Kenyan government bonds.
// Day-count: Actual/365 (fixed), the market convention for KES government
// securities accrued interest. All prices are per 100 face value.

import { addMonths } from 'date-fns';
import type { Bond } from '@/types/bond';

const DAYS_IN_YEAR = 365;

/**
 * Upper bound of the yield search, and a number the UI must not present as a
 * measurement. A deep discount on a bond weeks from redemption really does
 * annualise into the hundreds of percent — the arithmetic is right — but when
 * the solver pins here it has stopped measuring and started reporting its own
 * limit. `isYieldPinned` lets the caller say "over 200%" instead of the
 * spuriously precise "200.00%".
 */
export const YTM_CEILING = 200;

export function isYieldPinned(ytm: number): boolean {
  return ytm >= YTM_CEILING - 0.05;
}

/**
 * Kenyan withholding tax on bond interest:
 *  - Infrastructure bonds (IFB): exempt (0%)
 *  - Tenor >= 10 years: 10%
 *  - Tenor < 10 years: 15%
 */
export function determineWHTRate(bond: Pick<Bond, 'taxExempt' | 'tenorYears'>): number {
  if (bond.taxExempt) return 0;
  return bond.tenorYears >= 10 ? 0.1 : 0.15;
}

/** Scheduled coupon dates strictly after issue, up to and including maturity. */
export function getCouponDates(
  issueDate: Date,
  maturityDate: Date,
  frequencyPerYear: number
): Date[] {
  const dates: Date[] = [];
  const monthsStep = Math.round(12 / frequencyPerYear);
  let current = addMonths(issueDate, monthsStep);
  while (current <= maturityDate) {
    dates.push(current);
    current = addMonths(current, monthsStep);
  }
  // Guard against drift: the final coupon is always the maturity date.
  if (dates.length === 0 || dates[dates.length - 1].getTime() !== maturityDate.getTime()) {
    dates.push(new Date(maturityDate));
  }
  return dates;
}

/** Last coupon date on or before settlement (issue date if none has occurred). */
export function getLastCouponDate(bond: Bond, settlementDate: Date): Date {
  const issue = new Date(bond.issueDate);
  let last = issue;
  for (const d of getCouponDates(issue, new Date(bond.maturityDate), bond.couponFrequencyPerYear)) {
    if (d <= settlementDate) last = d;
    else break;
  }
  return last;
}

/** Next coupon date strictly after settlement, or null past maturity. */
export function getNextCouponDate(bond: Bond, settlementDate: Date): Date | null {
  const issue = new Date(bond.issueDate);
  for (const d of getCouponDates(issue, new Date(bond.maturityDate), bond.couponFrequencyPerYear)) {
    if (d > settlementDate) return d;
  }
  return null;
}

/** Accrued interest per 100 face value, Actual/365.
 *
 * Settlement is clamped to maturity because a bond stops paying interest when
 * it is redeemed. Without the clamp the day count simply keeps running: a bond
 * two and a half years past maturity reported 33.02 accrued per 100, which
 * would be added to the price and charged to the buyer as money owed to the
 * seller. Holdings outlive the listing — a portfolio entry, or a cached dataset
 * on a phone that has been offline — so a matured bond does reach this code.
 */
export function calculateAccruedInterest(bond: Bond, settlementDate: Date): number {
  const maturity = new Date(bond.maturityDate);
  const effective = settlementDate > maturity ? maturity : settlementDate;
  const lastCoupon = getLastCouponDate(bond, effective);
  const days = Math.max(0, (effective.getTime() - lastCoupon.getTime()) / 86_400_000);
  return (bond.couponRate * days) / DAYS_IN_YEAR;
}

/**
 * Solve YTM from a dirty price by bisection on the remaining cash flows.
 * Semi-annual compounding; time to each flow measured in half-year periods
 * (days/182.5, Act/365). `couponTaxFactor` scales coupons (1 = gross,
 * 1 - WHT = net); principal redemption is never taxed.
 * Returns annual percent.
 */
export function solveYTMFromPrice(
  bond: Bond,
  dirtyPrice: number,
  settlementDate: Date,
  couponTaxFactor = 1
): number {
  const freq = bond.couponFrequencyPerYear || 2;
  const couponPerPeriod = (bond.couponRate / freq) * couponTaxFactor;
  const maturity = new Date(bond.maturityDate);
  const flows = getCouponDates(new Date(bond.issueDate), maturity, freq)
    .filter((d) => d > settlementDate)
    .map((d) => ({
      t: (d.getTime() - settlementDate.getTime()) / 86_400_000 / (365 / freq),
      amount: couponPerPeriod + (d.getTime() === maturity.getTime() ? 100 : 0),
    }));
  if (!flows.length) return 0;

  const pv = (y: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + y / freq, f.t), 0);

  let lo = 0.000001, hi = YTM_CEILING / 100; // annual, as a fraction
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > dirtyPrice) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export interface InvestmentResult {
  faceValueKES: number;
  cleanPrice: number;
  accruedInterestPer100: number;
  dirtyPrice: number;
  settlementCostKES: number;
  whtRate: number;
  grossCouponPerPeriodKES: number;
  netCouponPerPeriodKES: number;
  grossAnnualIncomeKES: number;
  netAnnualIncomeKES: number;
  grossYTM: number;
  netYTM: number;
  taxDragBps: number;
  nextCouponDate: string | null;
  currentYieldNet: number; // net annual income / settlement cost
}

/**
 * Full investment economics for buying `faceValueKES` of a bond at
 * `cleanPrice` (per 100), settling on `settlementDate`.
 *
 * Gross and net YTM are solved from the dirty price by bisection on the
 * remaining cash-flow schedule (net = WHT-taxed coupons, untaxed principal),
 * so both respond correctly to the price the user actually pays.
 */
export function computeBondInvestment(
  bond: Bond,
  faceValueKES: number,
  cleanPrice: number,
  settlementDate: Date = new Date()
): InvestmentResult {
  const whtRate = determineWHTRate(bond);
  const accrued = calculateAccruedInterest(bond, settlementDate);
  const dirtyPrice = cleanPrice + accrued;
  const settlementCostKES = (faceValueKES * dirtyPrice) / 100;

  const freq = bond.couponFrequencyPerYear || 2;
  const grossCouponPerPeriodKES = (faceValueKES * bond.couponRate) / 100 / freq;
  const netCouponPerPeriodKES = grossCouponPerPeriodKES * (1 - whtRate);
  const grossAnnualIncomeKES = grossCouponPerPeriodKES * freq;
  const netAnnualIncomeKES = netCouponPerPeriodKES * freq;

  // Both yields are solved from the price the user actually pays. Net YTM
  // discounts WHT-taxed coupons with untaxed principal — exact, not a
  // coupon-share approximation.
  const grossYTM = solveYTMFromPrice(bond, dirtyPrice, settlementDate, 1);
  const netYTM = solveYTMFromPrice(bond, dirtyPrice, settlementDate, 1 - whtRate);

  const next = getNextCouponDate(bond, settlementDate);

  return {
    faceValueKES,
    cleanPrice,
    accruedInterestPer100: accrued,
    dirtyPrice,
    settlementCostKES,
    whtRate,
    grossCouponPerPeriodKES,
    netCouponPerPeriodKES,
    grossAnnualIncomeKES,
    netAnnualIncomeKES,
    grossYTM,
    netYTM,
    taxDragBps: (grossYTM - netYTM) * 100,
    nextCouponDate: next ? next.toISOString().slice(0, 10) : null,
    // Zero outlay has no yield to report. Without this the division is 0/0,
    // and the calculator rendered "NaN%" the moment anyone cleared the amount
    // box — which the number input invites, since Number('') is 0.
    currentYieldNet:
      settlementCostKES > 0 ? (netAnnualIncomeKES / settlementCostKES) * 100 : 0,
  };
}

/**
 * Coupon dates falling in the `months` calendar months starting with `from`'s
 * month. Used by the portfolio cash-flow calendar; returns one bucket per
 * month so callers can render a fixed-width strip.
 */
export function couponsByMonth(
  bond: Bond,
  from: Date,
  months: number
): { year: number; month: number; count: number }[] {
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), count: 0 };
  });
  const dates = getCouponDates(
    new Date(bond.issueDate),
    new Date(bond.maturityDate),
    bond.couponFrequencyPerYear || 2
  );
  for (const d of dates) {
    if (d <= from) continue;
    const idx = (d.getFullYear() - from.getFullYear()) * 12 + (d.getMonth() - from.getMonth());
    if (idx >= 0 && idx < months) buckets[idx].count += 1;
  }
  return buckets;
}

export function formatKES(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPct(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}
