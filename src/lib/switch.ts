// Switch auctions — "should I swap the bond I hold for the one on offer?"
//
// CBK runs these every few weeks: holders of a short bond (or bills) give it up
// at a price CBK sets, and the proceeds buy a longer bond at a yield the holder
// bids. The prospectus prints both prices and nothing else. It does not say
// what the holder ends up with, and the comparison is not obvious, because the
// two paths end on different dates and the longer bond's coupons are taxed at a
// different rate.
//
// So both paths are run to the SAME horizon — the destination's maturity — and
// every shilling either path pays before then is reinvested to that horizon at
// one rate the reader chooses, applied to both. Whatever differs at the end is
// then down to the switch and not to the bookkeeping. The reinvestment rate is
// an assumption and is labelled as one; it is not a forecast.
//
// The source price is DIRTY, as CBK quotes it. That was checked, not assumed:
// for the 9 Nov 2026 switch, 115.8913 reproduces the prospectus's 9.9627% only
// when read as dirty (6.60% if treated as clean), and the destination's 12.28%
// reproduces CBK's own worked example — clean 99.9951 + accrued 5.9713. Both
// are pinned in tests/unit/switch.test.ts.

import type { Bond } from '../types/bond';
import { calculateAccruedInterest, determineWHTRate, solveYTMFromPrice } from './financial-engine';
import { buildCashflows } from './sell';
import { DAYS_IN_COUPON_PERIOD, DAY_MS } from './constants';

export interface SwitchInput {
  source: Bond;
  dest: Bond;
  /** Face value of the holding being switched. */
  sourceFaceKES: number;
  /** Settlement date of the switch (ISO). */
  settlement: string;
  /** CBK's price per 100 for the source, dirty, from the prospectus. */
  sourcePricePer100: number;
  /** The yield the holder bids (or expects to clear) on the destination. */
  destYieldPct: number;
  /** Net annual rate every cash flow is reinvested at until the horizon. */
  reinvestPct: number;
}

export interface SwitchPath {
  /** Net coupons received before the horizon, not reinvested. */
  netCouponsKES: number;
  /** Principal returned before or at the horizon. */
  principalKES: number;
  /** Everything above, each flow grown to the horizon at the reinvestment rate. */
  endValueKES: number;
  /** After-tax yield to the bond's own maturity at the switch price. */
  netYieldPct: number;
  /** Withholding tax rate on this bond's coupons. */
  whtRate: number;
}

export interface SwitchResult {
  proceedsKES: number;
  destDirtyPer100: number;
  destCleanPer100: number;
  destAccruedPer100: number;
  /** Face value of the destination bond the proceeds buy. */
  destFaceKES: number;
  /** Both paths are measured to this date: the later of the two maturities. */
  horizon: string;
  keep: SwitchPath;
  switched: SwitchPath;
  /** switched.endValueKES - keep.endValueKES. Positive favours switching. */
  advantageKES: number;
  /**
   * The reinvestment rate at which the two paths end level. Below it, keeping
   * the source and rolling its proceeds loses to switching; above it, keeping
   * wins. Null when no rate in 0–40% makes them equal.
   */
  breakevenReinvestPct: number | null;
}

/** Dirty price per 100 of a bond at an annual gross yield, CBK's convention. */
export function dirtyPriceAtYield(bond: Bond, yieldPct: number, settlement: Date): number {
  const flows = buildCashflows(bond, 100, settlement);
  const freq = bond.couponFrequencyPerYear || 2;
  const r = yieldPct / 100 / freq;
  return flows.reduce((pv, f) => {
    const t = (new Date(f.date).getTime() - settlement.getTime()) / DAY_MS / DAYS_IN_COUPON_PERIOD;
    return pv + (f.couponKES + f.principalKES) / Math.pow(1 + r, t);
  }, 0);
}

function grow(amount: number, from: Date, to: Date, ratePct: number): number {
  const years = Math.max(0, (to.getTime() - from.getTime()) / DAY_MS / 364);
  return amount * Math.pow(1 + ratePct / 100 / 2, years * 2);
}

function runPath(bond: Bond, face: number, settlement: Date, horizon: Date, reinvestPct: number, pricePer100: number): SwitchPath {
  const wht = determineWHTRate(bond);
  let netCouponsKES = 0;
  let principalKES = 0;
  let endValueKES = 0;
  for (const f of buildCashflows(bond, face, settlement)) {
    const d = new Date(f.date);
    if (d > horizon) break;
    netCouponsKES += f.netCouponKES;
    principalKES += f.principalKES;
    endValueKES += grow(f.netCouponKES + f.principalKES, d, horizon, reinvestPct);
  }
  return {
    netCouponsKES,
    principalKES,
    endValueKES,
    netYieldPct: solveYTMFromPrice(bond, pricePer100, settlement, 1 - wht),
    whtRate: wht,
  };
}

export function analyseSwitch(input: SwitchInput): SwitchResult {
  const settlement = new Date(input.settlement);
  const { source, dest } = input;
  const horizon = new Date(
    Math.max(new Date(source.maturityDate).getTime(), new Date(dest.maturityDate).getTime())
  );

  const proceedsKES = (input.sourceFaceKES * input.sourcePricePer100) / 100;
  const destDirtyPer100 = dirtyPriceAtYield(dest, input.destYieldPct, settlement);
  const destAccruedPer100 = calculateAccruedInterest(dest, settlement);
  const destFaceKES = (proceedsKES / destDirtyPer100) * 100;

  const at = (rate: number) => ({
    keep: runPath(source, input.sourceFaceKES, settlement, horizon, rate, input.sourcePricePer100),
    switched: runPath(dest, destFaceKES, settlement, horizon, rate, destDirtyPer100),
  });
  const { keep, switched } = at(input.reinvestPct);

  // Keeping gains from a higher reinvestment rate faster than switching does,
  // because its money comes back sooner, so the gap is monotonic in the rate.
  const gap = (rate: number) => {
    const p = at(rate);
    return p.switched.endValueKES - p.keep.endValueKES;
  };
  let breakevenReinvestPct: number | null = null;
  let lo = 0, hi = 40;
  if (gap(lo) * gap(hi) <= 0) {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (gap(lo) * gap(mid) <= 0) hi = mid;
      else lo = mid;
    }
    breakevenReinvestPct = (lo + hi) / 2;
  }

  return {
    proceedsKES,
    destDirtyPer100,
    destCleanPer100: destDirtyPer100 - destAccruedPer100,
    destAccruedPer100,
    destFaceKES,
    horizon: horizon.toISOString().slice(0, 10),
    keep,
    switched,
    advantageKES: switched.endValueKES - keep.endValueKES,
    breakevenReinvestPct,
  };
}
