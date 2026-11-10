import { describe, expect, it } from 'vitest';
import bondsData from '../../public/data/bonds.json';
import type { Bond } from '../../src/types/bond';
import { calculateAccruedInterest } from '../../src/lib/financial-engine';
import { dirtyPriceAtYield } from '../../src/lib/switch';

/**
 * The engine's price and accrued-interest arithmetic, pinned against CBK's own
 * pricing tables in the prospectus for the re-opened FXD1/2019/015 and
 * SDB1/2011/030 (auction 18 Nov 2026, settlement 23 Nov 2026), supplied
 * directly. The prospectus prints clean prices at 0.125-point yield steps and
 * states the accrued interest, so dirty = clean + AI is checkable to four
 * decimals. Every price in the app, the sell calculator and the switch
 * calculator rests on this arithmetic; this is the only place it is compared
 * with the issuer's number rather than with itself.
 */
const BONDS = bondsData as unknown as Bond[];
const find = (code: string) => BONDS.find((b) => b.issueCode === code)!;
const SETTLE = new Date('2026-11-23T00:00:00');

const CASES: { code: string; ai: number; rows: [number, number][] }[] = [
  {
    code: 'FXD1/2019/015',
    ai: 4.4505,
    rows: [[11.0, 108.9976], [12.0, 103.999], [12.5, 101.6147], [12.857, 99.9572], [13.0, 99.3035], [14.0, 94.8902], [15.0, 90.7399]],
  },
  {
    code: 'SDB1/2011/030',
    ai: 3.4615,
    rows: [[10.0, 114.9666], [11.5, 103.4194], [12.0, 99.9573], [13.0, 93.5459], [14.0, 87.7527]],
  },
];

describe('price arithmetic against CBK pricing tables (prospectus, 18 Nov 2026 auction)', () => {
  for (const c of CASES) {
    it(`${c.code}: accrued interest matches the prospectus`, () => {
      expect(calculateAccruedInterest(find(c.code), SETTLE)).toBeCloseTo(c.ai, 3);
    });
    for (const [y, clean] of c.rows) {
      it(`${c.code}: clean price at ${y.toFixed(4)}% is ${clean}`, () => {
        const b = find(c.code);
        const got = dirtyPriceAtYield(b, y, SETTLE) - calculateAccruedInterest(b, SETTLE);
        expect(got).toBeCloseTo(clean, 3);
      });
    }
  }
});
