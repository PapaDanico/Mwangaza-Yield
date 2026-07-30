// Treasury bill mathematics — Kenyan (CBK) convention.
//
// T-bills are DISCOUNT instruments: you pay less than face value and receive
// face value at maturity. CBK's quoted rate is NOT the effective annual yield —
// the discount is earned on a smaller outlay, so the EAY is higher, and 15%
// withholding tax then pulls the net back down. Surfacing that three-way gap is
// the whole point of this module.
//
// WHICH DISCOUNT CONVENTION, AND HOW WE LEARNED WE HAD THE WRONG ONE
// ------------------------------------------------------------------
// There are two, and they are not close at Kenyan tenors:
//
//   bank discount   Price = 100 - rate x days / 365      (quote is a discount ON FACE)
//   true discount   Price = 100 / (1 + rate x days / 365) (quote is a YIELD ON PRICE)
//
// This module used the first. CBK uses the second, and says so in every results
// release, on a line we had been reading past: "Price per Kshs 100 at average
// interest rate". Checked against the 03/08/2026 auction (issues 2693/091,
// 2667/182, 2622/364), using the weighted average rate of ACCEPTED bids:
//
//   tenor   CBK rate   CBK price    true discount   bank discount
//   91d     8.7882     97.8559      97.8559 ✓       97.8090  (-0.047)
//   182d    8.9545     95.7259      95.7259 ✓       95.5350  (-0.191)
//   364d    9.0169     91.7497      91.7497 ✓       91.0078  (-0.742)
//
// Three tenors spanning 91 to 364 days, exact to four decimals on one formula
// and wrong by up to three quarters of a shilling on the other. That is not a
// rounding question about which convention CBK means.
//
// The error ran the wrong way for us, which is why nothing looked odd. Treating
// a yield quote as a bank discount understates the price, and understating what
// you pay overstates what you earn: the 364-day bill was reporting roughly
// 9.87% gross EAY against a true 9.03%, about 84 basis points, and Ksh 742 too
// much interest on every Ksh 100,000 of face. At 91 days it was 22bps.
//
// The irony is exact and worth recording. This module exists because a quoted
// rate is not a return, and docs/HANDOVER-REVIEW.md faults an outside document
// for reprinting our discount rates as though they were yields. We had the
// mirror-image defect: we treated a quote that is already a yield as though it
// were a discount, and then "corrected" it a second time.
//
// Convention (see docs/DATA-SOURCES.md):
//   Price    = 100 / (1 + rate x days / 365)
//   Discount = Face - Price x Face / 100
//   EAY      = (Face / Price) ^ (365 / days) - 1

import type { TBill } from '../types/bond';

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

/**
 * Purchase price per 100 face for CBK's quoted rate.
 *
 * True discount, not bank discount — CBK's quote is a simple annualised yield
 * on the price paid, so the price is the present value of 100 at that rate.
 * Reproduces CBK's own "Price per Kshs 100 at average interest rate" line
 * exactly; see the header for the three-tenor check that established it.
 */
export function tbillPricePer100(discountRate: number, tenorDays: number): number {
  return 100 / (1 + (discountRate / 100) * (tenorDays / YEAR_DAYS));
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
