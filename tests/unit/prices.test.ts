import { describe, it, expect } from 'vitest';
import {
  resolvePrice,
  makePriceResolver,
  isPlausiblePrice,
  summarisePriceCoverage,
  describeProvenance,
  STALE_AFTER_DAYS,
  type UserPrice,
} from '../../src/lib/prices';
import { buildLadder } from '../../src/lib/ladder';
import type { Bond, SecondaryTrade } from '../../src/types/bond';

const asOf = new Date('2026-07-24');
const bond = { isin: 'KE-FXD1-2022-A' };

function trade(isin: string, tradeDate: string, price: number): SecondaryTrade {
  return { isin, tradeDate, price, yield: 13, volumeKES: 1_000_000, tradesCount: 3 };
}

function mine(isin: string, price: number, observedOn: string, note?: string): UserPrice {
  return { isin, price, observedOn, note, updatedAt: '2026-07-24T00:00:00Z' };
}

describe('resolvePrice', () => {
  it('falls back to par with the source labelled, never silently', () => {
    const r = resolvePrice(bond, [], [], asOf);
    expect(r.price).toBe(100);
    expect(r.source).toBe('par');
    expect(r.asOfDate).toBeNull();
  });

  it('uses a published trade when there is one', () => {
    const r = resolvePrice(bond, [trade(bond.isin, '2026-07-20', 96.4)], [], asOf);
    expect(r.price).toBe(96.4);
    expect(r.source).toBe('market');
    expect(r.ageDays).toBe(4);
  });

  it('takes the most recent print, not the first in the array', () => {
    const r = resolvePrice(
      bond,
      [trade(bond.isin, '2026-05-01', 90), trade(bond.isin, '2026-07-20', 96.4)],
      [],
      asOf
    );
    expect(r.price).toBe(96.4);
  });

  it("prefers the reader's own price over a published print", () => {
    // They went and looked; we only remembered.
    const r = resolvePrice(bond, [trade(bond.isin, '2026-07-20', 96.4)], [mine(bond.isin, 94.1, '2026-07-24')], asOf);
    expect(r.price).toBe(94.1);
    expect(r.source).toBe('user');
  });

  it('ignores an implausible stored price rather than planning on a typo', () => {
    const r = resolvePrice(bond, [], [mine(bond.isin, 9600, '2026-07-24')], asOf);
    expect(r.source).toBe('par');
    expect(r.price).toBe(100);
  });

  it('flags a price older than the staleness window', () => {
    const old = new Date(asOf.getTime() - (STALE_AFTER_DAYS + 5) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(resolvePrice(bond, [], [mine(bond.isin, 94, old)], asOf).stale).toBe(true);
    expect(resolvePrice(bond, [], [mine(bond.isin, 94, '2026-07-20')], asOf).stale).toBe(false);
  });

  it('does not crash on an unparseable date', () => {
    const r = resolvePrice(bond, [], [mine(bond.isin, 94, 'not-a-date')], asOf);
    expect(r.price).toBe(94);
    expect(r.ageDays).toBeNull();
    expect(r.stale).toBe(false);
  });
});

describe('isPlausiblePrice', () => {
  it('rejects what a bond price cannot be', () => {
    for (const bad of [0, -5, 39.9, 160.1, NaN, Infinity]) {
      expect(isPlausiblePrice(bad)).toBe(false);
    }
    for (const ok of [40, 96.4, 100, 160]) expect(isPlausiblePrice(ok)).toBe(true);
  });
});

describe('makePriceResolver', () => {
  it('returns the same resolution for repeated lookups', () => {
    const resolve = makePriceResolver([trade(bond.isin, '2026-07-20', 96.4)], [], asOf);
    expect(resolve(bond)).toBe(resolve(bond)); // memoised, identity-stable
  });
});

describe('summarisePriceCoverage', () => {
  it('counts par fallbacks as unpriced', () => {
    const c = summarisePriceCoverage([
      resolvePrice({ isin: 'a' }, [], [mine('a', 95, '2026-07-24')], asOf),
      resolvePrice({ isin: 'b' }, [trade('b', '2026-07-20', 97)], [], asOf),
      resolvePrice({ isin: 'c' }, [], [], asOf),
    ]);
    expect(c.total).toBe(3);
    expect(c.priced).toBe(2);
    expect(c.parFallback).toBe(1);
    expect(c.ratio).toBeCloseTo(2 / 3);
  });

  it('reports zero coverage for an empty plan without dividing by zero', () => {
    expect(summarisePriceCoverage([]).ratio).toBe(0);
  });
});

describe('par is a placeholder, never a valuation', () => {
  // The portfolio's mark-to-market column keys off `source !== 'par'`. If par
  // ever started reporting as a priced source, the app would begin telling
  // people their bonds are worth 100 — a claim about their money rather than a
  // disclosed default. This is the test that stops that regression.
  it('reports par as its own source so callers can refuse to value on it', () => {
    expect(resolvePrice(bond, [], [], asOf).source).toBe('par');
  });

  it('reports a real source whenever one exists', () => {
    expect(resolvePrice(bond, [trade(bond.isin, '2026-07-20', 97)], [], asOf).source).toBe('market');
    expect(resolvePrice(bond, [], [mine(bond.isin, 95, '2026-07-24')], asOf).source).toBe('user');
  });
});

describe('describeProvenance', () => {
  it('says par is a placeholder in as many words', () => {
    expect(describeProvenance(resolvePrice(bond, [], [], asOf))).toMatch(/placeholder/i);
  });
});

/* ------------------------------------------------ the point of all of this */

function mkBond(code: string, maturity: string, coupon: number): Bond {
  return {
    isin: `KE-${code.replace(/\//g, '-')}`,
    issueCode: code,
    name: code,
    category: 'FXD',
    issueDate: '2022-01-10',
    maturityDate: maturity,
    tenorYears: 10,
    couponRate: coupon,
    couponFrequencyPerYear: 2,
    ytmGross: coupon,
    minInvestmentKES: 50_000,
    taxExempt: false,
  };
}

describe('a recorded price actually changes the plan', () => {
  const universe = [mkBond('FXD1/2022/A', '2030-06-10', 13.0), mkBond('FXD1/2022/B', '2032-06-10', 13.5)];

  it('a discount price raises the yield the ladder reports', () => {
    const atPar = buildLadder(universe, [], 3_000_000, 10, 5, asOf);
    const atDiscount = buildLadder(universe, [], 3_000_000, 10, 5, asOf, [
      mine(universe[0].isin, 92, '2026-07-24'),
      mine(universe[1].isin, 92, '2026-07-24'),
    ]);
    expect(atDiscount.blendedNetYTM).toBeGreaterThan(atPar.blendedNetYTM);
    expect(atDiscount.totalCostKES).toBeLessThan(atPar.totalCostKES);
  });

  it('reports how much of the plan is still resting on par', () => {
    const partial = buildLadder(universe, [], 3_000_000, 10, 5, asOf, [mine(universe[0].isin, 92, '2026-07-24')]);
    expect(partial.priceCoverage.total).toBe(2);
    expect(partial.priceCoverage.priced).toBe(1);
    expect(partial.priceCoverage.parFallback).toBe(1);
  });

  it('an empty plan still carries a coverage summary', () => {
    const empty = buildLadder([], [], 3_000_000, 10, 5, asOf);
    expect(empty.priceCoverage.total).toBe(0);
    expect(empty.rungs).toEqual([]);
  });
});
