/**
 * Carry and roll-down: what each bond earns over the next year if the curve
 * stays exactly where it is.
 *
 * WHY THIS EXISTS. Institutional fixed-income platforms (Bloomberg YAS, the
 * Yield Book, S&P's bond analytics) all report carry and roll-down beside yield
 * and duration; retail tools stop at yield and ladder maturity. A yield to
 * maturity answers "what do I earn if I hold to the end". It does not answer
 * the question a saver with a one-year view actually has: which bond pays me
 * most to wait twelve months, and how far can the market move against me
 * before that stops being true. In a steep curve like Kenya's the answer is not
 * the longest bond. A bond with five years left slides down the curve faster
 * than one with twenty, and that slide is paid in price.
 *
 * WHAT IT COMPUTES, per bond, over a horizon (default 12 months):
 *   carry      coupons received, plus the pull of the price toward par at
 *              today's yield, with the curve held still.
 *   roll-down  the price gain from the bond moving to a shorter point on the
 *              same curve as its remaining life falls.
 *   cushion    how far yields can rise, in parallel, over the horizon before
 *              the bond's return after tax falls to zero.
 *
 * WHY A FITTED CURVE AND NOT EACH BOND'S OWN YIELD. Most outstanding bonds have
 * no recent clearing yield: on shipped data 13 of 56 are priced within 120 days.
 * A bond's own stale yield would make its roll-down an artefact of the calendar,
 * the exact error `yield-curve.ts` documents for the dashboard curve. So the
 * curve is fitted only to bonds priced recently, and every bond is read off
 * that one curve. The fit is a quadratic in ln(years): three parameters, smooth,
 * and honest about its own error (`rmseBp`), which the page prints.
 *
 * WHAT IT REFUSES TO DO. It does not extrapolate: a bond whose rolled-forward
 * remaining life falls outside the fitted range gets no row (absence is not
 * zero). It does not cover tax-exempt IFBs, whose yields sit on their own
 * curve. Tax follows the site's convention (`sell.ts`, `financial-engine.ts`):
 * coupons carry withholding tax, principal and price change do not.
 *
 * NOT A FORECAST. "Curve unchanged" is a benchmark, the way a bond's yield is a
 * benchmark. It is the starting point for asking what a change would cost,
 * which is what the cushion is for.
 */
import type { Bond } from '../types/bond';
import { determineWHTRate, getCouponDates } from './financial-engine';
import { dirtyPriceAtYield } from './switch';

const YEAR_MS = 365.25 * 86_400_000;

export interface CurveFit {
  /** y = c0 + c1·ln(t) + c2·ln(t)², t in years, y in percent. */
  coef: [number, number, number];
  n: number;
  minYears: number;
  maxYears: number;
  /** Root-mean-square error of the fit across its own points, in basis points. */
  rmseBp: number;
  maxAgeDays: number;
  points: { issueCode: string; years: number; yieldPct: number }[];
}

export interface FitOptions {
  /** A yield older than this is not a market reading. */
  maxAgeDays?: number;
  minPoints?: number;
}

const yearsBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / YEAR_MS;

/** Solve a 3x3 linear system by Gaussian elimination with partial pivoting. */
function solve3(a: number[][], b: number[]): number[] | null {
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = col + 1; r < 3; r++) {
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = m[r][3];
    for (let c = r + 1; c < 3; c++) s -= m[r][c] * x[c];
    x[r] = s / m[r][r];
  }
  return x;
}

/**
 * Fit the market curve from bonds priced recently. Returns null when there are
 * too few fresh points, or they do not span enough of the maturity range for a
 * curve to mean anything (a fit through points bunched at one tenor extrapolates
 * wildly and would be worse than no curve).
 */
export function fitCurve(bonds: Bond[], today: Date, opts: FitOptions = {}): CurveFit | null {
  const maxAgeDays = opts.maxAgeDays ?? 125;
  const minPoints = opts.minPoints ?? 6;
  const points: CurveFit['points'] = [];
  for (const b of bonds) {
    if (b.taxExempt || (b.category !== 'FXD' && b.category !== 'SDB')) continue;
    const years = yearsBetween(today, new Date(b.maturityDate));
    if (!(years > 0)) continue;
    if (!b.ytmAsOf) continue;
    const asOf = new Date(b.ytmAsOf);
    if (Number.isNaN(asOf.getTime())) continue;
    const ageDays = (today.getTime() - asOf.getTime()) / 86_400_000;
    if (ageDays < 0 || ageDays > maxAgeDays) continue;
    if (!Number.isFinite(b.ytmGross)) continue;
    points.push({ issueCode: b.issueCode, years, yieldPct: b.ytmGross });
  }
  if (points.length < minPoints) return null;
  const minYears = Math.min(...points.map((p) => p.years));
  const maxYears = Math.max(...points.map((p) => p.years));
  if (maxYears / minYears < 3) return null;

  // Normal equations for y = c0 + c1·x + c2·x², x = ln(years).
  const s = [0, 0, 0, 0, 0];
  const t = [0, 0, 0];
  for (const p of points) {
    const x = Math.log(p.years);
    for (let k = 0; k < 5; k++) s[k] += x ** k;
    for (let k = 0; k < 3; k++) t[k] += p.yieldPct * x ** k;
  }
  const c = solve3([[s[0], s[1], s[2]], [s[1], s[2], s[3]], [s[2], s[3], s[4]]], t);
  if (!c) return null;
  const coef: [number, number, number] = [c[0], c[1], c[2]];
  const f = (yrs: number) => coef[0] + coef[1] * Math.log(yrs) + coef[2] * Math.log(yrs) ** 2;
  const sse = points.reduce((a, p) => a + (p.yieldPct - f(p.years)) ** 2, 0);
  return {
    coef,
    n: points.length,
    minYears,
    maxYears,
    rmseBp: Math.sqrt(sse / points.length) * 100,
    maxAgeDays,
    points,
  };
}

/** The fitted yield at a remaining life, or null outside the range the fit covers. */
export function yieldAt(fit: CurveFit, years: number): number | null {
  if (!(years >= fit.minYears) || years > fit.maxYears) return null;
  const x = Math.log(years);
  return fit.coef[0] + fit.coef[1] * x + fit.coef[2] * x * x;
}

export interface CarryRoll {
  issueCode: string;
  yearsLeft: number;
  /** Curve yield for today's remaining life, and for the life left at the horizon. */
  yieldNowPct: number;
  yieldRolledPct: number;
  /** Return over the horizon, as a percentage of today's dirty price. */
  grossReturnPct: number;
  netReturnPct: number;
  /** Of the net return: coupons plus pull to par, and the roll-down gain. */
  carryNetPct: number;
  rollDownPct: number;
  /**
   * Parallel yield rise, in basis points, that takes the net return to zero
   * over the horizon. Capped at 1,000.
   */
  cushionBp: number;
  /**
   * Net return over the horizon if yields have moved in parallel by the
   * scenario shift on top of the unchanged curve. Equals `netReturnPct` when
   * the shift is zero.
   */
  shockedNetReturnPct: number;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

/**
 * One bond's carry and roll-down against a fitted curve. Null when the bond is
 * out of scope (tax-exempt, wrong category) or the curve does not reach both
 * its current and its rolled-forward remaining life.
 */
export function carryRoll(bond: Bond, fit: CurveFit, today: Date, months = 12, shiftBp = 0): CarryRoll | null {
  if (bond.taxExempt || (bond.category !== 'FXD' && bond.category !== 'SDB')) return null;
  const horizon = addMonths(today, months);
  const maturity = new Date(bond.maturityDate);
  const yearsLeft = yearsBetween(today, maturity);
  const yearsAtHorizon = yearsBetween(horizon, maturity);
  if (!(yearsAtHorizon > 0)) return null;
  const y0 = yieldAt(fit, yearsLeft);
  const y1 = yieldAt(fit, yearsAtHorizon);
  if (y0 == null || y1 == null) return null;

  const freq = bond.couponFrequencyPerYear || 2;
  const couponsPaid = getCouponDates(new Date(bond.issueDate), maturity, freq).filter(
    (d) => d > today && d <= horizon,
  ).length;
  const coupons = couponsPaid * (bond.couponRate / freq);
  const wht = determineWHTRate(bond);

  const dirty0 = dirtyPriceAtYield(bond, y0, today);
  const dirtyStill = dirtyPriceAtYield(bond, y0, horizon);
  const dirtyRolled = dirtyPriceAtYield(bond, y1, horizon);
  if (!(dirty0 > 0)) return null;

  const netCoupons = coupons * (1 - wht);
  const pct = (v: number) => (v / dirty0) * 100;

  // Parallel rise at the horizon that brings the net return to zero.
  const netAt = (shift: number) =>
    dirtyPriceAtYield(bond, y1 + shift, horizon) + netCoupons - dirty0;
  let cushionBp = 0;
  if (netAt(0) > 0) {
    let lo = 0;
    let hi = 10;
    if (netAt(hi) > 0) cushionBp = 1000;
    else {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (netAt(mid) > 0) lo = mid;
        else hi = mid;
      }
      cushionBp = ((lo + hi) / 2) * 100;
    }
  }

  return {
    issueCode: bond.issueCode,
    yearsLeft,
    yieldNowPct: y0,
    yieldRolledPct: y1,
    grossReturnPct: pct(dirtyRolled + coupons - dirty0),
    netReturnPct: pct(dirtyRolled + netCoupons - dirty0),
    carryNetPct: pct(dirtyStill + netCoupons - dirty0),
    shockedNetReturnPct: pct(netAt(shiftBp / 100)),
    rollDownPct: pct(dirtyRolled - dirtyStill),
    cushionBp,
  };
}

export interface CarryRollTable {
  fit: CurveFit;
  rows: CarryRoll[];
}

/** Every in-scope bond against one fitted curve, shortest remaining life first. */
export function carryRollTable(bonds: Bond[], today: Date, months = 12, shiftBp = 0): CarryRollTable | null {
  const fit = fitCurve(bonds, today);
  if (!fit) return null;
  const rows: CarryRoll[] = [];
  for (const b of bonds) {
    const r = carryRoll(b, fit, today, months, shiftBp);
    if (r) rows.push(r);
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.yearsLeft - b.yearsLeft);
  return { fit, rows };
}
