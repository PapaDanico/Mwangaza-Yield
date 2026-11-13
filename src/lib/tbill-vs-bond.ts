/**
 * Bill or bond? The same money, the same dates, two ways to hold it.
 *
 * THE QUESTION A READER ACTUALLY HAS. A 91-day bill pays about 8.7% and a
 * ten-year bond about 13%; the bond looks obviously better until you ask what
 * the bill does next. A bill is rolled: when it matures you buy another at
 * whatever rate the market then offers. A bond locks its yield for its whole
 * life. So the honest comparison is not "8.7 against 13". It is "13, locked,
 * against whatever short rates average over the same years", and the useful
 * output is the short rate at which the two come out equal: the BREAK-EVEN.
 * Above it, rolling bills wins; below it, the bond wins. Nobody can know which
 * side of it the future falls, and this module does not pretend to.
 *
 * HOW BOTH SIDES ARE MEASURED. Over the bond's whole remaining life, from the
 * same settlement date, with the same money, both after Kenyan withholding tax
 * and both to the same horizon, so the two numbers are comparable:
 *
 *   bond    the contractual net cash flows (coupons after tax, principal
 *           untaxed), with each coupon reinvested in 91-day bills at the assumed
 *           short rate until maturity. Its realised yield is what the money grew
 *           to, annualised. Coupons sitting idle would understate the bond; that
 *           is why reinvestment is part of the comparison and not a footnote.
 *   bills   rolled at the same assumed short rate for the same years.
 *
 * Both sides use the SAME reinvestment vehicle (net effective yield of a 91-day
 * bill at the assumed rate), so the only thing separating them is what the bond
 * locks in against what the bills must re-earn.
 *
 * WHAT IT REFUSES TO DO. It does not forecast the short rate: that is the
 * reader's scenario, labelled as one, and the break-even is the answer that does
 * not need a forecast. It does not value a sale before maturity, which depends
 * on a price nobody can know in advance (use /sell/). It returns `null` for a
 * matured bond or an invalid price rather than a confident number.
 */
import type { Bond } from '../types/bond';
import { computeBondInvestment, getCouponDates } from './financial-engine';
import { computeTBill } from './tbills';

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365;
const BILL_TENOR_DAYS = 91;

export interface BillBondInput {
  bond: Bond;
  /** Clean price per 100 the reader would pay. */
  cleanPrice: number;
  faceValueKES: number;
  settlement: Date;
  /** The assumed average quoted 91-day bill rate over the period, % p.a. A scenario, not a forecast. */
  billRatePct: number;
}

export interface BillBondComparison {
  /** Days from settlement to the bond's maturity: the horizon for both sides. */
  horizonDays: number;
  years: number;
  costKES: number;
  bond: {
    /** Net YTM from the engine: the contractual yield if every coupon were reinvested at that same yield. */
    netYTMPct: number;
    /** Net coupons plus principal, with no reinvestment: what the contract pays. */
    contractualNetCashKES: number;
    /** What the money has grown to at maturity with coupons reinvested in bills at the assumed rate. */
    finalValueKES: number;
    /** `finalValueKES` annualised, %. */
    realisedYieldPct: number;
  };
  bills: {
    /** Net effective annual yield of a 91-day bill at the assumed rate, %. */
    netYieldPct: number;
    finalValueKES: number;
  };
  /** Bond minus bills, percentage points a year. Positive favours the bond. */
  advantagePp: number;
  winner: 'bond' | 'bills' | 'tie';
}

/** The net effective annual yield, as a fraction, of rolling 91-day bills at a quoted rate. */
function billNetEAYFraction(ratePct: number): number {
  return computeTBill(100, ratePct, BILL_TENOR_DAYS).netEAY / 100;
}

export function compareBillWithBond(input: BillBondInput): BillBondComparison | null {
  const { bond, cleanPrice, faceValueKES, settlement, billRatePct } = input;
  if (!(cleanPrice > 0) || !(faceValueKES > 0) || !(billRatePct > 0) || Number.isNaN(settlement.getTime())) return null;
  const maturity = new Date(bond.maturityDate);
  const horizonDays = (maturity.getTime() - settlement.getTime()) / DAY_MS;
  if (!(horizonDays > 0)) return null;

  const r = computeBondInvestment(bond, faceValueKES, cleanPrice, settlement);
  const costKES = r.settlementCostKES;
  if (!(costKES > 0)) return null;

  const g = billNetEAYFraction(billRatePct);
  const freq = bond.couponFrequencyPerYear || 2;
  const coupons = getCouponDates(new Date(bond.issueDate), maturity, freq).filter((d) => d.getTime() > settlement.getTime());

  let contractualNetCashKES = faceValueKES;
  let finalValueKES = faceValueKES;
  for (const d of coupons) {
    const daysLeft = (maturity.getTime() - d.getTime()) / DAY_MS;
    contractualNetCashKES += r.netCouponPerPeriodKES;
    finalValueKES += r.netCouponPerPeriodKES * Math.pow(1 + g, daysLeft / YEAR_DAYS);
  }

  const years = horizonDays / YEAR_DAYS;
  const realisedYield = Math.pow(finalValueKES / costKES, 1 / years) - 1;
  const billFinal = costKES * Math.pow(1 + g, years);
  const advantagePp = (realisedYield - g) * 100;

  return {
    horizonDays,
    years,
    costKES,
    bond: { netYTMPct: r.netYTM, contractualNetCashKES, finalValueKES, realisedYieldPct: realisedYield * 100 },
    bills: { netYieldPct: g * 100, finalValueKES: billFinal },
    advantagePp,
    winner: Math.abs(advantagePp) < 0.005 ? 'tie' : advantagePp > 0 ? 'bond' : 'bills',
  };
}

/**
 * The average quoted 91-day rate at which rolling bills and holding the bond
 * end level, or null when the two never cross in a plausible range (the bond
 * wins at every rate up to the ceiling, or loses at every rate above the floor).
 */
export function breakEvenBillRate(input: Omit<BillBondInput, 'billRatePct'>, floorPct = 0.5, ceilingPct = 40): number | null {
  const gap = (rate: number) => compareBillWithBond({ ...input, billRatePct: rate })?.advantagePp ?? NaN;
  let lo = floorPct;
  let hi = ceilingPct;
  const gLo = gap(lo);
  const gHi = gap(hi);
  if (Number.isNaN(gLo) || Number.isNaN(gHi)) return null;
  // Bond advantage falls as the assumed short rate rises. No sign change: no break-even.
  if (gLo < 0 || gHi > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface SensitivityRow {
  billRatePct: number;
  bondYieldPct: number;
  billsYieldPct: number;
  advantagePp: number;
  winner: BillBondComparison['winner'];
}

/** The comparison at a spread of assumed short rates, for a table beside the break-even. */
export function billRateSensitivity(input: Omit<BillBondInput, 'billRatePct'>, ratesPct: number[]): SensitivityRow[] {
  return ratesPct.flatMap((billRatePct) => {
    const c = compareBillWithBond({ ...input, billRatePct });
    return c
      ? [{ billRatePct, bondYieldPct: c.bond.realisedYieldPct, billsYieldPct: c.bills.netYieldPct, advantagePp: c.advantagePp, winner: c.winner }]
      : [];
  });
}
