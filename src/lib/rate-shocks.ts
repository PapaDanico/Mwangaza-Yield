/**
 * What a bond would sell for if market yields moved.
 *
 * This is the EXACT inverse of `solveYTMFromPrice`: the same flows, the same
 * day-count, so repricing at the yield the solver returned gives back the
 * price it was given. That identity is the test, and it is why this does not
 * use the duration/convexity approximation the bond card shows: for a +/-200bp
 * move on a long bond the approximation is visibly off, and a table headed
 * "price if yields move" should be a repricing, not an estimate of one.
 *
 * Gross of tax, like the yield on a dealer's sheet, because the price a buyer
 * pays depends on the market's yield, not on the seller's tax position.
 *
 * Refuses (returns null) for a bond that amortises, a matured bond or a
 * non-positive yield, rather than reprice cash flows it does not model.
 */
import type { Bond } from '../types/bond';
import { getCouponDates, solveYTMFromPrice } from './financial-engine';
import { DAYS_IN_YEAR } from './constants';

const DAY_MS = 86_400_000;

/** Dirty price per 100 at an annual yield in percent. */
export function dirtyPriceAtYield(bond: Bond, settlement: Date, yieldPct: number): number | null {
  if (!(yieldPct > 0)) return null;
  const freq = bond.couponFrequencyPerYear || 2;
  const maturity = new Date(bond.maturityDate);
  const coupon = bond.couponRate / freq;
  const flows = getCouponDates(new Date(bond.issueDate), maturity, freq)
    .filter((d) => d > settlement)
    .map((d) => ({
      t: (d.getTime() - settlement.getTime()) / DAY_MS / (DAYS_IN_YEAR / freq),
      amount: coupon + (d.getTime() === maturity.getTime() ? 100 : 0),
    }));
  if (!flows.length) return null;
  const y = yieldPct / 100;
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + y / freq, f.t), 0);
}

export interface ShockRow {
  shockBp: number;
  yieldPct: number;
  dirtyPrice: number;
  /** Change in dirty price against today's, per 100. */
  changePer100: number;
  changePct: number;
}

export function rateShocks(
  bond: Bond,
  settlement: Date,
  dirtyPriceNow: number,
  shocksBp: number[] = [-200, -100, -50, 0, 50, 100, 200],
): { anchorYieldPct: number; rows: ShockRow[] } | null {
  if (!(dirtyPriceNow > 0)) return null;
  const anchor = solveYTMFromPrice(bond, dirtyPriceNow, settlement);
  if (!(anchor > 0)) return null;
  const rows: ShockRow[] = [];
  for (const bp of shocksBp) {
    const y = anchor + bp / 100;
    const p = dirtyPriceAtYield(bond, settlement, y);
    if (p == null) continue;
    rows.push({ shockBp: bp, yieldPct: y, dirtyPrice: p, changePer100: p - dirtyPriceNow, changePct: ((p - dirtyPriceNow) / dirtyPriceNow) * 100 });
  }
  return rows.length ? { anchorYieldPct: anchor, rows } : null;
}
