// Treasury bill mathematics — Kenyan (CBK) convention.
//
// T-bills are DISCOUNT instruments: you pay less than face value and receive
// face value at maturity. CBK quotes a *discount rate*, which is NOT what you
// earn — the effective annual yield is higher (you earn the discount on a
// smaller outlay), and 15% withholding tax then pulls the net back down.
// Surfacing that three-way gap is the whole point of this module.
//
// Convention (see docs/DATA-SOURCES.md):
//   Discount = Face x rate x days / 365
//   Price    = Face - Discount
//   EAY      = (Face / Price) ^ (365 / days) - 1

import type { TBill } from '@/types/bond';

/** WHT on Treasury bill interest. Unlike infrastructure bonds, bills are never exempt. */
export const TBILL_WHT_RATE = 0.15;

const YEAR_DAYS = 365;

export interface TBillResult {
  tenorDays: number;
  discountRate: number;      // quoted, % p.a.
  pricePer100: number;
  faceValueKES: number;
  costKES: number;           // what you pay today
  grossInterestKES: number;  // the discount you earn
  whtKES: number;
  netInterestKES: number;
  netProceedsKES: number;    // returned at maturity, after WHT
  grossEAY: number;          // effective annual yield, %
  netEAY: number;            // after 15% WHT, %
  taxDragBps: number;
  /** How much higher the true gross yield is than the quoted discount rate. */
  quoteGapBps: number;
}

/** Purchase price per 100 face for a quoted discount rate. */
export function tbillPricePer100(discountRate: number, tenorDays: number): number {
  return 100 - (discountRate * tenorDays) / YEAR_DAYS;
}

/** Full economics of buying `faceValueKES` of a bill at the quoted discount rate. */
export function computeTBill(
  faceValueKES: number,
  discountRate: number,
  tenorDays: number
): TBillResult {
  const pricePer100 = tbillPricePer100(discountRate, tenorDays);

  const costKES = (faceValueKES * pricePer100) / 100;
  const grossInterestKES = faceValueKES - costKES;
  const whtKES = grossInterestKES * TBILL_WHT_RATE;
  const netInterestKES = grossInterestKES - whtKES;
  const netProceedsKES = costKES + netInterestKES;

  // Derived from the PRICE, not the amount. A yield does not depend on how much
  // you buy — a 91-day bill at 97.7 returns the same percentage on one shilling
  // as on ten million — and dividing by the amount meant that clearing the
  // amount box, which the number input invites since Number('') is 0, made
  // costKES zero and every yield on the page 0/0. The T-bill screen rendered
  // "NaN%" as the headline "what you actually earn" figure.
  const netPer100 = 100 - (100 - pricePer100) * TBILL_WHT_RATE;
  const grossEAY = (Math.pow(100 / pricePer100, YEAR_DAYS / tenorDays) - 1) * 100;
  const netEAY = (Math.pow(netPer100 / pricePer100, YEAR_DAYS / tenorDays) - 1) * 100;

  return {
    tenorDays,
    discountRate,
    pricePer100,
    faceValueKES,
    costKES,
    grossInterestKES,
    whtKES,
    netInterestKES,
    netProceedsKES,
    grossEAY,
    netEAY,
    taxDragBps: (grossEAY - netEAY) * 100,
    quoteGapBps: (grossEAY - discountRate) * 100,
  };
}

export interface RolloverProjection {
  cycles: number;
  finalValueKES: number;
  totalNetInterestKES: number;
  /** Net annualised return of the whole rolling programme. */
  netAnnualisedYield: number;
  schedule: { cycle: number; startKES: number; netInterestKES: number; endKES: number }[];
}

/**
 * Rolling a bill: reinvest net proceeds each maturity for `months`.
 * Assumes the rate holds — the dominant risk in a rollover strategy, and the
 * reason the UI states it plainly rather than implying a locked-in return.
 */
export function projectRollover(
  startKES: number,
  discountRate: number,
  tenorDays: number,
  months: number
): RolloverProjection {
  const horizonDays = (months / 12) * YEAR_DAYS;
  const cycles = Math.max(1, Math.floor(horizonDays / tenorDays));

  const schedule: RolloverProjection['schedule'] = [];
  let balance = startKES;
  let totalNetInterestKES = 0;

  const pricePer100 = tbillPricePer100(discountRate, tenorDays);
  for (let c = 1; c <= cycles; c++) {
    // Face value bought is what the current balance can purchase at this price.
    const face = (balance * 100) / pricePer100;
    const r = computeTBill(face, discountRate, tenorDays);
    schedule.push({ cycle: c, startKES: balance, netInterestKES: r.netInterestKES, endKES: r.netProceedsKES });
    totalNetInterestKES += r.netInterestKES;
    balance = r.netProceedsKES;
  }

  const elapsedDays = cycles * tenorDays;
  const netAnnualisedYield = (Math.pow(balance / startKES, YEAR_DAYS / elapsedDays) - 1) * 100;

  return { cycles, finalValueKES: balance, totalNetInterestKES, netAnnualisedYield, schedule };
}

/** Best net effective yield across the offered tenors. */
export function bestTBill(bills: TBill[], faceValueKES = 100_000): { bill: TBill; result: TBillResult } | null {
  if (!bills.length) return null;
  return bills
    .map((bill) => ({ bill, result: computeTBill(faceValueKES, bill.discountRate, bill.tenorDays) }))
    .sort((a, b) => b.result.netEAY - a.result.netEAY)[0];
}
