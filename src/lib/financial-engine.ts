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
 * Net YTM approximation: gross YTM with the coupon stream taxed at the WHT
 * rate. For par-region prices this is ytm * (1 - wht * couponShare); we use
 * the simple, conservative ytm * (1 - wht) bound adjusted by current-yield
 * weighting so premium/discount bonds are not misstated.
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

  // Tax hits only the coupon stream, not principal redemption. Weight the
  // WHT drag by the coupon's share of gross return at this price.
  const grossYTM = bond.ytmGross;
  const currentYieldGross = (grossAnnualIncomeKES / settlementCostKES) * 100;
  const couponShare = grossYTM > 0 ? Math.min(1, currentYieldGross / grossYTM) : 1;
  const netYTM = grossYTM * (1 - whtRate * couponShare);

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
