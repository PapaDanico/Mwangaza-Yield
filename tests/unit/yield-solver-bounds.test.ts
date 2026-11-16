import { describe, expect, it } from 'vitest';
import {
  computeBondInvestment, formatYield, isYieldFloored, isYieldPinned, solveYTMFromPrice, YTM_CEILING, YTM_FLOOR,
} from '../../src/lib/financial-engine';
import { dirtyPriceAtYield } from '../../src/lib/rate-shocks';
import type { Bond } from '../../src/types/bond';

/**
 * The solver must never print its own limit as a yield (audit MY-002).
 * Reproduced 16 Nov 2026: a 12% bond quoted at 250 came back as 0.00%, and at
 * 5 as 200.00%. The first has a real negative yield; the second is the ceiling.
 */
const bond: Bond = {
  isin: 'KE-T', issueCode: 'FXD1/T', name: 't', category: 'FXD',
  issueDate: '2022-01-10', maturityDate: '2032-01-05', tenorYears: 10, couponRate: 12,
  couponFrequencyPerYear: 2, ytmGross: 12, minInvestmentKES: 50_000, taxExempt: false,
};
const asOf = new Date('2026-07-24');

describe('yield solver bounds', () => {
  it('reprices: the yield it returns reproduces the price it was given', () => {
    for (const price of [60, 85, 100, 115, 140, 170]) {
      const y = solveYTMFromPrice(bond, price, asOf);
      expect(dirtyPriceAtYield(bond, asOf, y)!).toBeCloseTo(price, 6);
    }
  });

  it('price falls as yield rises, across negative and positive yields', () => {
    let last = Infinity;
    for (let y = -20; y <= 60; y += 5) {
      const p = dirtyPriceAtYield(bond, asOf, y)!;
      expect(p).toBeLessThan(last);
      last = p;
    }
  });

  it('a price above the sum of the remaining cash flows has a negative yield, not 0.00%', () => {
    // At a zero yield the price IS the undiscounted sum of what is left to be paid.
    const undiscounted = dirtyPriceAtYield(bond, asOf, 0)!;
    expect(undiscounted % 6).toBeCloseTo(100 % 6, 9); // whole coupons of 6 plus 100
    expect(solveYTMFromPrice(bond, undiscounted, asOf)).toBeCloseTo(0, 6);
    const y = solveYTMFromPrice(bond, undiscounted + 10, asOf);
    expect(y).toBeLessThan(0);
    expect(isYieldFloored(y)).toBe(false);
    expect(dirtyPriceAtYield(bond, asOf, y)!).toBeCloseTo(undiscounted + 10, 6);
  });

  it('names both limits instead of printing them', () => {
    const tooCheap = solveYTMFromPrice(bond, 0.5, asOf);
    expect(isYieldPinned(tooCheap)).toBe(true);
    expect(formatYield(tooCheap)).toBe(`over ${YTM_CEILING}%`);
    const absurd = solveYTMFromPrice(bond, 100_000, asOf);
    expect(isYieldFloored(absurd)).toBe(true);
    expect(formatYield(absurd)).toBe(`below ${YTM_FLOOR}%`);
    expect(formatYield(12.3456)).toBe('12.35%');
    expect(formatYield(NaN)).toBe('not available');
  });

  it('ordinary prices are unchanged by the wider search', () => {
    const r = computeBondInvestment(bond, 100_000, 100, asOf);
    expect(r.grossYTM).toBeCloseTo(12.7578, 3);
    expect(r.netYTM).toBeCloseTo(11.4907, 3);
  });
});

describe('purchase charge validation (audit MY-011)', () => {
  it('accepts zero, an omitted charge and a positive charge', () => {
    expect(computeBondInvestment(bond, 100_000, 100, asOf).purchaseChargesKES).toBe(0);
    expect(computeBondInvestment(bond, 100_000, 100, asOf, 0).purchaseChargesKES).toBe(0);
    expect(computeBondInvestment(bond, 100_000, 100, asOf, 750).purchaseChargesKES).toBe(750);
  });
  it.each([NaN, -500, Infinity, -Infinity])('rejects %s instead of treating it as zero', (bad) => {
    expect(() => computeBondInvestment(bond, 100_000, 100, asOf, bad)).toThrow(RangeError);
  });
});
