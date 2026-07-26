import { describe, it, expect } from 'vitest';
import bondsData from '../../public/data/bonds.json';
import macroData from '../../public/data/macro.json';
import {
  CPI_MAX_AGE_DAYS,
  exemptionRealMultiple,
  latestInflation,
  realRate,
  realReturn,
} from '../../src/lib/real-yield';
import { computeBondInvestment } from '../../src/lib/financial-engine';
import type { Bond, MacroIndicator } from '../../src/types/bond';

/**
 * Turning nominal yields into what the money is actually worth.
 *
 * Two mistakes would ship silently here and both flatter the reader: using
 * subtraction instead of Fisher, and deflating the gross yield instead of the
 * net one. Each is pinned below with teeth.
 */

const bonds = bondsData as unknown as Bond[];
const macro = macroData as unknown as MacroIndicator[];
const ASOF = new Date('2026-07-26');
const live = bonds
  .filter((b) => new Date(b.maturityDate) > ASOF)
  .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

describe('reading the inflation rate', () => {
  it('finds the CPI print the app already ships', () => {
    const r = latestInflation(macro, ASOF)!;
    expect(r).not.toBeNull();
    expect(r.rate).toBeGreaterThan(0);
    expect(r.rate).toBeLessThan(50);
    expect(r.source).toBeTruthy();
    expect(r.stale).toBe(false);
  });

  it('takes the most recent print, not the first in the file', () => {
    const shuffled: MacroIndicator[] = [
      { id: 'a', indicator: 'CPI', value: 99, date: '2019-01-01', unit: '% y/y', source: 'old' },
      ...macro,
    ];
    expect(latestInflation(shuffled, ASOF)!.rate).not.toBe(99);
  });

  it('returns null rather than a guess when there is no CPI at all', () => {
    const noCpi = macro.filter((m) => m.indicator !== 'CPI');
    expect(latestInflation(noCpi, ASOF)).toBeNull();
  });

  it('flags a print too old to deflate anything with', () => {
    const r = latestInflation(macro, new Date('2026-07-26'))!;
    const wayLater = new Date(
      new Date(r.asOf).getTime() + (CPI_MAX_AGE_DAYS + 30) * 86_400_000,
    );
    expect(latestInflation(macro, wayLater)!.stale).toBe(true);
  });
});

describe('Fisher, not subtraction', () => {
  it('is strictly below the naive difference whenever inflation is positive', () => {
    // The whole reason this function exists. If someone "simplifies" it to
    // n - i, this fails at every Kenyan rate pair.
    for (const [n, i] of [[11.56, 6.41], [13.6, 6.41], [8, 2], [20, 15]]) {
      expect(realRate(n, i)).toBeLessThan(n - i);
    }
  });

  it('matches the closed form to the basis point', () => {
    expect(realRate(11.56, 6.41)).toBeCloseTo(
      ((1.1156 / 1.0641) - 1) * 100, 10,
    );
    // The measured example in the module docs.
    expect(realRate(11.56, 6.41)).toBeCloseTo(4.84, 2);
    expect(11.56 - 6.41 - realRate(11.56, 6.41)).toBeCloseTo(0.31, 2);
  });

  it('is the identity when inflation is zero, and negative when it exceeds the yield', () => {
    expect(realRate(9, 0)).toBeCloseTo(9, 10);
    expect(realRate(5, 9)).toBeLessThan(0);
  });
});

describe('deflating the net yield, never the gross', () => {
  const taxable = live.find((b) => !b.taxExempt)!;

  it('reports the same nominal net the rest of the app shows', () => {
    const r = computeBondInvestment(taxable, 100_000, 100, ASOF);
    const real = realReturn(taxable, r.netYTM, r.grossYTM, 6.41, ASOF);
    expect(real.nominalNetYTM).toBeCloseTo(r.netYTM, 10);
  });

  /**
   * The teeth. Tax comes off first, then inflation deflates what survives.
   * Deflating the gross instead would hand a taxable bond the whole withholding
   * rate back — the substitution that overstated a sister product's T-bill
   * ladder by three quarters of a point.
   */
  it('never reports the real gross as the real return', () => {
    const r = computeBondInvestment(taxable, 100_000, 100, ASOF);
    expect(r.grossYTM).toBeGreaterThan(r.netYTM);
    const real = realReturn(taxable, r.netYTM, r.grossYTM, 6.41, ASOF);
    expect(real.realNetYTM).toBeLessThan(real.realGrossYTM);
    expect(real.realNetYTM).toBeCloseTo(realRate(r.netYTM, 6.41), 10);
  });

  it('leaves a tax-free bond with nothing between its gross and net real yields', () => {
    const ifb = live.find((b) => b.taxExempt);
    expect(ifb, 'the archive should carry at least one IFB').toBeDefined();
    const r = computeBondInvestment(ifb!, 100_000, 100, ASOF);
    const real = realReturn(ifb!, r.netYTM, r.grossYTM, 6.41, ASOF);
    expect(real.realNetYTM).toBeCloseTo(real.realGrossYTM, 6);
  });
});

describe('the principal is not protected', () => {
  it('erodes the face value over the life of the bond', () => {
    const r = computeBondInvestment(live[0], 100_000, 100, ASOF);
    const short = realReturn(live[0], r.netYTM, r.grossYTM, 6.41, ASOF);
    const longest = [...live].reverse()[0];
    const lr = computeBondInvestment(longest, 100_000, 100, ASOF);
    const long = realReturn(longest, lr.netYTM, lr.grossYTM, 6.41, ASOF);

    expect(long.yearsToMaturity).toBeGreaterThan(short.yearsToMaturity);
    expect(long.principalRealValuePer100).toBeLessThan(short.principalRealValuePer100);
    expect(long.principalErosionPct).toBeGreaterThan(short.principalErosionPct);
  });

  it('matches the compounding closed form', () => {
    const b = live[3];
    const r = computeBondInvestment(b, 100_000, 100, ASOF);
    const real = realReturn(b, r.netYTM, r.grossYTM, 6.41, ASOF);
    expect(real.principalRealValuePer100).toBeCloseTo(
      100 / Math.pow(1.0641, real.yearsToMaturity), 8,
    );
    expect(real.principalRealValuePer100 + real.principalErosionPct).toBeCloseTo(100, 8);
  });

  it('at zero inflation nothing erodes', () => {
    const r = computeBondInvestment(live[2], 100_000, 100, ASOF);
    const real = realReturn(live[2], r.netYTM, r.grossYTM, 0, ASOF);
    expect(real.principalRealValuePer100).toBeCloseTo(100, 8);
    expect(real.realNetYTM).toBeCloseTo(r.netYTM, 8);
  });
});

describe('the summary is honest about what it assumed', () => {
  const b = live.find((x) => !x.taxExempt)!;
  const r = computeBondInvestment(b, 100_000, 100, ASOF);

  it('always names the inflation rate it held constant', () => {
    const real = realReturn(b, r.netYTM, r.grossYTM, 6.41, ASOF);
    expect(real.summary).toMatch(/held constant/);
    expect(real.summary).toMatch(/6\.41%/);
  });

  it('says outright when purchasing power is being lost', () => {
    // Inflation far above any plausible yield.
    const real = realReturn(b, r.netYTM, r.grossYTM, 40, ASOF);
    expect(real.gainsPurchasingPower).toBe(false);
    expect(real.realNetYTM).toBeLessThan(0);
    expect(real.summary).toMatch(/LOSES/);
    expect(real.summary).toMatch(/grows in shillings and shrinks in what it buys/);
  });

  it('never recommends anything', () => {
    for (const infl of [0, 6.41, 40]) {
      const real = realReturn(b, r.netYTM, r.grossYTM, infl, ASOF);
      expect(real.summary).not.toMatch(/\bshould buy\b|\bgood investment\b|\brecommend/i);
    }
  });

  it('states the break-even as the nominal net yield, which is what it is', () => {
    const real = realReturn(b, r.netYTM, r.grossYTM, 6.41, ASOF);
    expect(real.breakEvenInflationPct).toBeCloseTo(r.netYTM, 10);
    expect(realRate(r.netYTM, real.breakEvenInflationPct)).toBeCloseTo(0, 10);
  });
});

describe('what the tax exemption is really worth', () => {
  // Not the front of the queue: FXD1/2016/10 matures in three weeks and its
  // net yield at par is 2.45%, below inflation, so there is no real return for
  // the exemption to be a share of. Take something with a life left.
  const taxable = live.find(
    (b) => !b.taxExempt && new Date(b.maturityDate) > new Date('2031-01-01'),
  )!;

  it('is worth proportionally more in real terms than in nominal terms', () => {
    const r = computeBondInvestment(taxable, 100_000, 100, ASOF);
    const m = exemptionRealMultiple(r.grossYTM, r.netYTM, 6.41);
    expect(m).not.toBeNull();
    expect(m!).toBeGreaterThan(1);
  });

  it('grows as inflation rises — that is the point', () => {
    const r = computeBondInvestment(taxable, 100_000, 100, ASOF);
    const low = exemptionRealMultiple(r.grossYTM, r.netYTM, 2)!;
    const high = exemptionRealMultiple(r.grossYTM, r.netYTM, 8)!;
    expect(high).toBeGreaterThan(low);
  });

  it('refuses when there is no exemption to value', () => {
    expect(exemptionRealMultiple(13.6, 13.6, 6.41)).toBeNull();
  });

  it('refuses rather than divide through a wiped-out real return', () => {
    expect(exemptionRealMultiple(13.6, 11.56, 40)).toBeNull();
  });
});

describe('across the whole shipped universe', () => {
  it('every live bond gets a finite, ordered real reading', () => {
    const infl = latestInflation(macro, ASOF)!.rate;
    for (const b of live) {
      const r = computeBondInvestment(b, 100_000, 100, ASOF);
      const real = realReturn(b, r.netYTM, r.grossYTM, infl, ASOF);
      expect(Number.isFinite(real.realNetYTM)).toBe(true);
      expect(real.realNetYTM).toBeLessThan(real.nominalNetYTM);
      expect(real.principalRealValuePer100).toBeGreaterThan(0);
      expect(real.principalRealValuePer100).toBeLessThanOrEqual(100);
    }
  });
});
