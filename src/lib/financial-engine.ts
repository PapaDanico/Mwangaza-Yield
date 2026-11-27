// Pure financial math for Kenyan government bonds.
// All prices are per 100 face value.

import type { Bond } from '../types/bond';

/**
 * Kenya runs its government securities on a 364-day year, and this is not an
 * assumption — the published data says so unambiguously:
 *
 *  - Treasury bills are issued for 91, 182 and 364 days. Every tenor is a whole
 *    number of weeks; none is a calendar quarter, half or year.
 *  - Every one of the bonds we list is ISSUED and REDEEMED on a Monday, without
 *    exception, which only holds if the schedule advances in whole weeks.
 *  - The gap between issue and maturity is an exact multiple of 182 days for
 *    every bond. A ten-year bond runs 3,640 days — 20 x 182, or 10 x 364 — not
 *    3,652. There is no stub period anywhere in the set.
 *
 * So a coupon period is exactly 182 days and the year is 364. The two numbers
 * have to agree, and only these do: a full period accrues 182/364 of the annual
 * coupon, which is exactly the half-coupon that gets paid. Under Actual/365 the
 * day before a payment you have accrued 182/365 = 49.86% of the annual coupon,
 * and the remaining 0.14% appears from nowhere on payment day. The accrual
 * never reconciles with the cheque.
 */
import { DAYS_IN_COUPON_PERIOD, DAYS_IN_YEAR, YTM_CEILING, YTM_FLOOR } from './constants';

/**
 * Upper bound of the yield search, and a number the UI must not present as a
 * measurement. A deep discount on a bond weeks from redemption really does
 * annualise into the hundreds of percent — the arithmetic is right — but when
 * the solver pins here it has stopped measuring and started reporting its own
 * limit. `isYieldPinned` lets the caller say "over 200%" instead of the
 * spuriously precise "200.00%".
 */
export { YTM_CEILING };

export function isYieldPinned(ytm: number): boolean {
  return ytm >= YTM_CEILING - 0.05;
}

export { YTM_FLOOR };

/**
 * The other end. Until 16 Nov 2026 the search started at zero, so a price above
 * the sum of a bond's remaining cash flows (a 12% bond quoted at 250) came back
 * as "0.00%": the solver's lower limit printed as though it were a yield. Such
 * a price has a real, negative yield, and the search now reaches it. Below
 * `YTM_FLOOR` it is pinned again, and this says so.
 */
export function isYieldFloored(ytm: number): boolean {
  return ytm <= YTM_FLOOR + 0.05;
}

/** A yield for display: the solver's limits are named as limits, never printed as figures. */
export function formatYield(ytm: number, decimals = 2): string {
  if (!Number.isFinite(ytm)) return 'not available';
  if (isYieldPinned(ytm)) return `over ${YTM_CEILING}%`;
  if (isYieldFloored(ytm)) return `below ${YTM_FLOOR}%`;
  return `${ytm.toFixed(decimals)}%`;
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

/**
 * Scheduled coupon dates strictly after issue, up to and including maturity.
 *
 * These are exact, not estimated. The schedule advances in whole 182-day steps
 * from the issue date, which lands the final one precisely on maturity and every
 * one in between on a Monday, matching how the bonds are actually issued.
 *
 * The previous version stepped six CALENDAR months at a time, and every date it
 * produced was wrong. Six months is 181 to 184 days depending where you start,
 * so the schedule drifted off the Monday grid immediately and further with each
 * step; a ten-year bond's dates ended up as much as twelve days adrift, and the
 * final period was silently truncated by a guard that forced the last date onto
 * maturity. Those dates fed accrued interest, so the error was money: twelve
 * days of a 13% coupon is 0.43 per 100, or Ksh 4,300 wrongly said to be owed to
 * the seller on a million-shilling purchase.
 *
 * `frequencyPerYear` is honoured for anything that is not semi-annual, but no
 * Kenyan government bond we have seen pays on any other frequency.
 */
export function getCouponDates(
  issueDate: Date,
  maturityDate: Date,
  frequencyPerYear: number
): Date[] {
  const step = frequencyPerYear === 2
    ? DAYS_IN_COUPON_PERIOD
    : Math.round(DAYS_IN_YEAR / frequencyPerYear);
  const dates: Date[] = [];
  const maturity = maturityDate.getTime();
  for (let n = 1; ; n++) {
    const t = issueDate.getTime() + n * step * 86_400_000;
    if (t >= maturity) break;
    dates.push(new Date(t));
  }
  // Redemption always carries the final coupon, whatever the arithmetic leaves.
  dates.push(new Date(maturity));
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

/** Accrued interest per 100 face value, Actual/364.
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
 * The cash flows left on 100 of face held at `settlementDate`, honouring the
 * bond's amortisation schedule (27 Nov 2026).
 *
 * Coupons are paid on the balance outstanding during the period; on each
 * scheduled date `fraction` of the balance outstanding just before it is
 * repaid; whatever remains is repaid at maturity. Steps on or before
 * settlement are ignored, because the face held is already net of them and
 * CBK quotes prices per 100 of it. A bond without a schedule is a bullet, as
 * before. Reproduces CBK's printed price tables for amortising IFBs to their
 * printed decimals (tests/unit/ifb-amortisation.test.ts); the bullet model
 * this replaced missed IFB1/2021/018 by 3.2 per 100.
 */
/**
 * CBK redeems in full any holding of up to KSh 1.0 million per CSD account at
 * an amortisation date ("Any amount up to KES 1.0 million per CSD account at
 * amortization will be redeemed in full", every IFB prospectus 2015-2026;
 * pledged holdings excepted). Applied only when a caller passes the holding.
 */
export const IFB_FULL_REDEMPTION_LIMIT_KES = 1_000_000;

/**
 * The date a holding of `holdingKES` is fully repaid early under the KSh 1m
 * rule, or null when it runs to maturity (or the bond does not amortise).
 */
export function earlyFullRedemptionDate(bond: Bond, settlementDate: Date, holdingKES: number): string | null {
  const maturity = new Date(bond.maturityDate);
  let outstanding = holdingKES;
  for (const s of [...(bond.amortisation ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
    const when = new Date(s.date);
    if (when <= settlementDate || when >= maturity) continue;
    if (outstanding <= IFB_FULL_REDEMPTION_LIMIT_KES) return s.date;
    outstanding *= 1 - s.fraction;
  }
  return null;
}

export function remainingFlowsPer100(
  bond: Bond,
  settlementDate: Date,
  couponTaxFactor = 1,
  /** The reader's own holding, to apply CBK's KSh 1m full-redemption rule. Omit for CBK's standard schedule. */
  holdingKES?: number
): { t: number; amount: number }[] {
  const freq = bond.couponFrequencyPerYear || 2;
  const couponPerPeriod = (bond.couponRate / freq) * couponTaxFactor;
  const maturity = new Date(bond.maturityDate);
  const steps = (bond.amortisation ?? [])
    .map((s) => ({ when: new Date(s.date), fraction: s.fraction }))
    .filter((s) => s.when > settlementDate && s.when < maturity)
    .sort((a, b) => a.when.getTime() - b.when.getTime());
  const coupons = getCouponDates(new Date(bond.issueDate), maturity, freq).filter((d) => d > settlementDate);
  const dates = [...new Set([...coupons, ...steps.map((s) => s.when)].map((d) => d.getTime()))].sort((a, b) => a - b);
  const isCoupon = new Set(coupons.map((d) => d.getTime()));
  let balance = 100;
  const out: { t: number; amount: number }[] = [];
  for (const ms of dates) {
    // The coupon accrues on the balance before any repayment that same day.
    let amount = isCoupon.has(ms) ? couponPerPeriod * (balance / 100) : 0;
    for (const s of steps) {
      if (s.when.getTime() !== ms) continue;
      const fullyRedeemed = holdingKES !== undefined
        && (holdingKES * balance) / 100 <= IFB_FULL_REDEMPTION_LIMIT_KES;
      const repaid = fullyRedeemed ? balance : balance * Math.min(1, Math.max(0, s.fraction));
      amount += repaid;
      balance -= repaid;
    }
    if (ms === maturity.getTime()) {
      amount += balance;
      balance = 0;
    }
    out.push({ t: (ms - settlementDate.getTime()) / 86_400_000 / (DAYS_IN_YEAR / freq), amount });
    if (balance <= 0) break;
  }
  return out;
}

/**
 * Solve YTM from a dirty price by bisection on the remaining cash flows.
 * Semi-annual compounding; time to each flow measured in coupon periods of 182
 * days (Act/364), so a flow one period out sits at exactly t = 1 rather than
 * the 0.997 that a 182.5-day period gave. `couponTaxFactor` scales coupons
 * (1 = gross,
 * 1 - WHT = net); principal redemption is never taxed.
 * Returns annual percent.
 */
export function solveYTMFromPrice(
  bond: Bond,
  dirtyPrice: number,
  settlementDate: Date,
  couponTaxFactor = 1,
  holdingKES?: number
): number {
  const freq = bond.couponFrequencyPerYear || 2;
  const flows = remainingFlowsPer100(bond, settlementDate, couponTaxFactor, holdingKES);
  if (!flows.length) return 0;

  const pv = (y: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + y / freq, f.t), 0);

  // Annual, as a fraction. The floor is negative: see isYieldFloored.
  let lo = YTM_FLOOR / 100, hi = YTM_CEILING / 100;
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
  /** Broker or bank charge the reader entered, included in the cost above and in both yields. 0 when none. */
  purchaseChargesKES: number;
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
  /**
   * When `applyHolderRules` is set: the date CBK repays this holding in full
   * under the KSh 1m rule, which both yields already reflect. Null otherwise.
   */
  earlyFullRedemptionDate: string | null;
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
  settlementDate: Date = new Date(),
  /**
   * What an intermediary charges on this purchase, in shillings, as the reader
   * was told it. Defaults to 0 and is never assumed: CBK's own DhowCSD terms
   * show no bidding fee that we could find, so a direct bid costs the price
   * alone, and a bank's or broker's tariff is the reader's to enter. The charge
   * is part of what leaves the account, so it lowers both yields.
   */
  purchaseChargesKES: number = 0,
  /**
   * Apply rules that depend on the reader's own holding (CBK's KSh 1m full
   * redemption at an IFB amortisation date). Market-wide tables leave this off
   * so every bond is on CBK's standard schedule; a personal calculator sets it.
   */
  options: { applyHolderRules?: boolean } = {}
): InvestmentResult {
  const holding = options.applyHolderRules && faceValueKES > 0 ? faceValueKES : undefined;
  const whtRate = determineWHTRate(bond);
  const accrued = calculateAccruedInterest(bond, settlementDate);
  const dirtyPrice = cleanPrice + accrued;
  // An explicit charge that is not a real amount is an error, not zero: quietly
  // dropping a malformed fee understates the cost and overstates both yields.
  // (`sell.ts` already rejects an invalid sale charge the same way.)
  if (!Number.isFinite(purchaseChargesKES) || purchaseChargesKES < 0) {
    throw new RangeError('The purchase charge must be zero or a positive amount.');
  }
  const charges = purchaseChargesKES;
  const settlementCostKES = (faceValueKES * dirtyPrice) / 100 + charges;
  // The yield is solved from what you actually pay per 100 of face, charges included.
  const effectiveDirty = faceValueKES > 0 ? (settlementCostKES / faceValueKES) * 100 : dirtyPrice;

  const freq = bond.couponFrequencyPerYear || 2;
  const grossCouponPerPeriodKES = (faceValueKES * bond.couponRate) / 100 / freq;
  const netCouponPerPeriodKES = grossCouponPerPeriodKES * (1 - whtRate);
  const grossAnnualIncomeKES = grossCouponPerPeriodKES * freq;
  const netAnnualIncomeKES = netCouponPerPeriodKES * freq;

  // Both yields are solved from the price the user actually pays. Net YTM
  // discounts WHT-taxed coupons with untaxed principal — exact, not a
  // coupon-share approximation.
  const grossYTM = solveYTMFromPrice(bond, effectiveDirty, settlementDate, 1, holding);
  const netYTM = solveYTMFromPrice(bond, effectiveDirty, settlementDate, 1 - whtRate, holding);

  const next = getNextCouponDate(bond, settlementDate);

  return {
    faceValueKES,
    cleanPrice,
    accruedInterestPer100: accrued,
    dirtyPrice,
    settlementCostKES,
    purchaseChargesKES: charges,
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
    earlyFullRedemptionDate: holding !== undefined ? earlyFullRedemptionDate(bond, settlementDate, holding) : null,
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

/**
 * Money, written the way Kenyans write it.
 *
 * `style: 'currency'` with `currency: 'KES'` renders the ISO 4217 code —
 * "KES 3,136,262" — which is what every report, every stat card and every
 * exported PDF has been showing. The sister product writes "Ksh", and a reader
 * holding a JiPange fee plan next to a Mwangaza ladder plan was being shown
 * two different names for one currency.
 *
 * Ksh is what a Kenyan reader writes and reads. The ISO code is for wire
 * instructions, and nothing here is a wire instruction.
 *
 * The sign goes OUTSIDE the unit — "-Ksh 500", not "Ksh -500" — because the
 * latter reads as a quantity of some negative currency. Intl's currency mode
 * handled that; a hand-rolled prefix is precisely where it gets dropped, so it
 * is explicit here and covered by a test.
 */
export function formatKES(value: number, decimals = 0): string {
  const n = Number.isFinite(value) ? value : 0;
  const digits = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n));
  return `${n < 0 ? '-' : ''}Ksh ${digits}`;
}

export function formatPct(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}
