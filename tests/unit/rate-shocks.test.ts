import { describe, expect, it } from 'vitest';
import type { Bond } from '../../src/types/bond';
import { dirtyPriceAtYield, rateShocks } from '../../src/lib/rate-shocks';
import { solveYTMFromPrice } from '../../src/lib/financial-engine';

const SETTLE = new Date('2026-11-16T00:00:00Z');
function mk(maturity: string, coupon = 12): Bond {
  const issue = new Date(new Date(maturity).getTime() - 40 * 182 * 86_400_000).toISOString().slice(0, 10);
  return { isin: 'KE-X', issueCode: 'X', name: 'X', category: 'FXD', issueDate: issue, maturityDate: maturity, tenorYears: 10,
    couponRate: coupon, couponFrequencyPerYear: 2, ytmGross: 12, minInvestmentKES: 50000, taxExempt: false, source: 'https://www.centralbank.go.ke/' } as Bond;
}
const FIVE = mk('2031-11-10');
const LONG = mk('2040-11-12');

describe('rate shocks', () => {
  it('is the exact inverse of the yield solver', () => {
    for (const p of [92, 100, 108]) {
      const y = solveYTMFromPrice(FIVE, p, SETTLE);
      expect(dirtyPriceAtYield(FIVE, SETTLE, y)!).toBeCloseTo(p, 4);
    }
  });
  it('a coupon-rate yield prices near par on a coupon date and falls as yields rise', () => {
    const a = dirtyPriceAtYield(FIVE, SETTLE, 10)!;
    const b = dirtyPriceAtYield(FIVE, SETTLE, 12)!;
    const c = dirtyPriceAtYield(FIVE, SETTLE, 14)!;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
  it('the zero shock changes nothing; up is a loss, down a gain; longer bonds move more', () => {
    const f = rateShocks(FIVE, SETTLE, 100)!;
    const l = rateShocks(LONG, SETTLE, 100)!;
    const at = (r: typeof f, bp: number) => r.rows.find((x) => x.shockBp === bp)!;
    expect(at(f, 0).changePer100).toBeCloseTo(0, 6);
    expect(at(f, 100).changePer100).toBeLessThan(0);
    expect(at(f, -100).changePer100).toBeGreaterThan(0);
    expect(Math.abs(at(l, 100).changePct)).toBeGreaterThan(Math.abs(at(f, 100).changePct));
  });
  it('is convex: a fall gains more than the same rise loses', () => {
    const r = rateShocks(LONG, SETTLE, 100)!;
    const up = r.rows.find((x) => x.shockBp === 200)!.changePer100;
    const dn = r.rows.find((x) => x.shockBp === -200)!.changePer100;
    expect(dn).toBeGreaterThan(-up);
  });
  it('refuses rather than invent: matured bond, bad price', () => {
    expect(rateShocks(mk('2026-06-15'), SETTLE, 100)).toBeNull();
    expect(rateShocks(FIVE, SETTLE, 0)).toBeNull();
    expect(dirtyPriceAtYield(FIVE, SETTLE, 0)).toBeNull();
  });
});
