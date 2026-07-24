// Pure financial math for Kenyan government bonds.
// Day-count: Actual/365 (fixed), the market convention for KES government
// securities accrued interest. All prices are per 100 face value.

import { addMonths } from 'date-fns';
import type { Bond } from '@/types/bond';

const DAYS_IN_YEAR = 365;

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

/** Accrued interest per 100 face value, Actual/365. */
export function calculateAccruedInterest(bond: Bond, settlementDate: Date): number {
  const lastCoupon = getLastCouponDate(bond, settlementDate);
  const days = Math.max(0, (settlementDate.getTime() - lastCoupon.getTime()) / 86_400_000);
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

  let lo = 0.000001, hi = 2; // 0–200% annual
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
    currentYieldNet: (netAnnualIncomeKES / settlementCostKES) * 100,
  };
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
