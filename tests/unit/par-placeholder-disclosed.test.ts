import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import secondaryData from '../../public/data/secondary.json';
import { resolvePrice } from '../../src/lib/prices';

/**
 * NO COMPONENT MAY PRICE A BOND AT PAR WITHOUT SAYING SO.
 *
 * This project publishes no market prices — exchange price data is licensed
 * and we take none of it — so `secondary.json` is empty and every bond
 * resolves to the par placeholder until a reader records their own price.
 * A yield at par is roughly the coupon. It is a real number and it is not a
 * rate anybody can go and get.
 *
 * lib/prices.ts was built to make that unmissable: it returns a `source` of
 * 'user' | 'market' | 'par' so provenance travels with the value, and its own
 * opening comment describes the bug it exists to prevent — planners that
 * "used to fall back silently to par 100", leaving "no way to tell a real
 * price from a placeholder".
 *
 * LiveYieldCard was written past all of it, with a bare `?? 100`, and captioned
 * the result "Best net yield today" in the largest type on the landing page.
 * The abstraction existed; the most prominent caller bypassed it. That is what
 * this test watches for — not one component's copy, but the bypass itself.
 */

const SRC = new URL('../../src/', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Source with comments stripped — a warning ABOUT `?? 100` is not a use of it. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*\*.*$/gm, ' ');
}

describe('the par placeholder is never presented as a market price', () => {
  it('the premise still holds: we publish no market prices', () => {
    // If this ever fails, real prices are shipping and the whole disclosure
    // question changes. It should change deliberately, not by drift.
    expect(
      (secondaryData as unknown[]).length,
      'secondary.json now carries prices — revisit whether the par caveat is still right'
    ).toBe(0);
  });

  it('resolvePrice reports par as par, which is what callers must branch on', () => {
    const resolved = resolvePrice({ isin: 'KE0000000000' }, [], []);
    expect(resolved.price).toBe(100);
    expect(resolved.source).toBe('par');
    expect(resolved.asOfDate).toBeNull();
  });

  it('no component reaches past resolvePrice with its own ?? 100 fallback', () => {
    const files = walk(SRC);
    expect(files.length, 'walked no source files — this test would be vacuous').toBeGreaterThan(50);

    /* The rule is not "never write ?? 100" — it is "a par fallback is only
     * allowed where provenance is resolved".
     *
     * CalculatorClient legitimately writes `priceInfo?.price ?? 100`: its
     * priceInfo IS a resolvePrice result, it renders a PriceBadge from it and
     * branches on `source === 'user'`. The fallback there guards a null, and
     * the reader is told which price they are looking at either way. Flagging
     * it would train the next person to silence this test rather than read it.
     *
     * What is banned is deciding par WITHOUT ever asking where the price came
     * from — which is exactly what LiveYieldCard did. lib/prices.ts is where
     * par is legitimately decided, so it is exempt. */
    const offenders = files.filter((f) => {
      if (f.endsWith('/lib/prices.ts')) return false;
      const src = code(f);
      const fallsBackToPar = /(?:price|Price)\s*(?:\?\.\w+\s*)?\?\?\s*100\b/.test(src);
      const resolvesProvenance = /resolvePrice|makePriceResolver/.test(src);
      return fallsBackToPar && !resolvesProvenance;
    });

    expect(
      offenders.map((f) => f.slice(SRC.length)),
      'these price a bond at par without going through resolvePrice(), which is how ' +
        'a placeholder reaches a reader as though it were the market. Use ' +
        'resolvePrice()/makePriceResolver() from @/lib/prices and branch on `source`.'
    ).toEqual([]);
  });

  it('the landing card discloses par rather than captioning it "today"', () => {
    const src = readFileSync(join(SRC, 'components/landing/LiveYieldCard.tsx'), 'utf8');
    expect(src, 'the card does not resolve provenance at all').toMatch(/makePriceResolver|resolvePrice/);
    expect(src, "the card never checks for the 'par' source").toMatch(/source === 'par'/);
    // The disclosure itself, and the word that makes it actionable.
    expect(src, 'no par disclosure is rendered').toMatch(/placeholder, not the market/);
    // "today" must not be the caption when the figure rests on a placeholder.
    const caption = src.match(/atPar \? '([^']+)' : '([^']+)'/);
    expect(caption, 'the caption no longer switches on whether we hold a price').not.toBeNull();
    expect(caption![1].toLowerCase()).not.toContain('today');
  });
});
