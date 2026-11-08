import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_INPUT_AMOUNT, nonNegativeNumber } from '../../src/lib/utils';
import { computeBondInvestment } from '../../src/lib/financial-engine';
import type { Bond } from '../../src/types/bond';

const BONDS: Bond[] = JSON.parse(
  readFileSync(new URL('../../public/data/bonds.json', import.meta.url), 'utf8')
);

/**
 * A field can deliver 1e308, and the arithmetic downstream cannot take it.
 *
 * Typing 1e308 into an amount field multiplied through a price and a tax rate
 * to Infinity, and /calculator/, /goals/ and /ladder/ printed "NaN%" for the
 * yield. The arithmetic sweep drives the functions with values it chooses; this
 * drives the value a FIELD can deliver, through the one function every amount
 * field reads through.
 */
describe('amount fields are bounded where they are read', () => {
  it('clamps an absurd amount to the declared ceiling', () => {
    expect(nonNegativeNumber('1e308')).toBe(MAX_INPUT_AMOUNT);
    expect(nonNegativeNumber('99999999999999999999')).toBe(MAX_INPUT_AMOUNT);
  });

  it('leaves ordinary amounts, zero, negatives and junk as they were', () => {
    expect(nonNegativeNumber('1000000')).toBe(1_000_000);
    expect(nonNegativeNumber('0')).toBe(0);
    expect(nonNegativeNumber('-5')).toBe(0);
    expect(nonNegativeNumber('abc')).toBe(0);
    expect(nonNegativeNumber('Infinity')).toBe(0);
  });

  it('the largest accepted amount still produces finite figures', () => {
    expect(BONDS.length).toBeGreaterThan(0);
    for (const bond of BONDS.slice(0, 12)) {
      const r = computeBondInvestment(bond, MAX_INPUT_AMOUNT, 100) as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v), `${bond.issueCode} ${k} = ${v}`).toBe(true);
        }
      }
    }
  });
});
