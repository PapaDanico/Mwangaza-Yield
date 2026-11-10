import { describe, expect, it } from 'vitest';
import bondsData from '../../public/data/bonds.json';
import type { Bond } from '../../src/types/bond';
import { carryRoll, carryRollTable, fitCurve, yieldAt } from '../../src/lib/carry-rolldown';
import { dirtyPriceAtYield } from '../../src/lib/switch';

const TODAY = new Date('2026-11-10T00:00:00');

function mk(code: string, maturity: string, coupon: number, ytm: number, asOf = '2026-11-01', over: Partial<Bond> = {}): Bond {
  return {
    isin: `KE-${code}`,
    issueCode: code,
    name: code,
    category: 'FXD',
    issueDate: '2020-01-13',
    maturityDate: maturity,
    tenorYears: 10,
    couponRate: coupon,
    couponFrequencyPerYear: 2,
    ytmGross: ytm,
    minInvestmentKES: 50000,
    taxExempt: false,
    ytmAsOf: asOf,
    source: 'https://www.centralbank.go.ke/',
    ...over,
  } as Bond;
}

// A curve with known shape: y = 8 + 2·ln(t). Maturities on the 13th of Jan/Jul
// so coupon dates line up with the horizon.
const yAt = (t: number) => 8 + 2 * Math.log(t);
const yearsTo = (iso: string) => (new Date(iso).getTime() - TODAY.getTime()) / (365.25 * 86_400_000);
const MATS = ['2029-07-13', '2031-01-13', '2033-07-13', '2036-01-13', '2040-07-13', '2046-01-13', '2056-07-13'];
const synthetic = () => MATS.map((m, i) => mk(`B${i}`, m, 12, yAt(yearsTo(m))));

describe('fitCurve', () => {
  it('recovers a known curve exactly', () => {
    const fit = fitCurve(synthetic(), TODAY)!;
    expect(fit).not.toBeNull();
    expect(fit.coef[0]).toBeCloseTo(8, 6);
    expect(fit.coef[1]).toBeCloseTo(2, 6);
    expect(fit.coef[2]).toBeCloseTo(0, 6);
    expect(fit.rmseBp).toBeLessThan(0.001);
  });

  it('ignores stale yields, tax-exempt bonds and other categories', () => {
    const base = synthetic();
    const noise = [
      mk('STALE', '2036-01-13', 12, 30, '2024-01-01'),
      mk('IFB', '2036-01-13', 12, 30, '2026-11-01', { taxExempt: true, category: 'IFB' }),
    ];
    const fit = fitCurve([...base, ...noise], TODAY)!;
    expect(fit.n).toBe(base.length);
    expect(fit.rmseBp).toBeLessThan(0.001);
  });

  it('returns null rather than a curve through too few or too bunched points', () => {
    expect(fitCurve(synthetic().slice(0, 5), TODAY)).toBeNull();
    const bunched = [4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6].map((y, i) => mk(`C${i}`, `${2030 + (i % 2)}-07-13`, 12, y));
    expect(fitCurve(bunched, TODAY)).toBeNull();
  });
});

describe('yieldAt', () => {
  it('does not extrapolate', () => {
    const fit = fitCurve(synthetic(), TODAY)!;
    expect(yieldAt(fit, fit.minYears - 0.1)).toBeNull();
    expect(yieldAt(fit, fit.maxYears + 0.1)).toBeNull();
    expect(yieldAt(fit, 10)).toBeCloseTo(yAt(10), 6);
  });
});

describe('carryRoll', () => {
  const fit = fitCurve(synthetic(), TODAY)!;

  it('rolls down a rising curve: positive roll-down, larger where the curve is steeper', () => {
    const near = carryRoll(mk('NEAR', '2033-07-13', 12, 0), fit, TODAY)!;
    const far = carryRoll(mk('FAR', '2046-01-13', 12, 0), fit, TODAY)!;
    expect(near.rollDownPct).toBeGreaterThan(0);
    expect(far.rollDownPct).toBeGreaterThan(0);
    expect(near.rollDownPct).toBeGreaterThan(far.rollDownPct);
    expect(near.yieldRolledPct).toBeLessThan(near.yieldNowPct);
  });

  it('a flat curve has no roll-down', () => {
    const flat = fitCurve(MATS.map((m, i) => mk(`F${i}`, m, 12, 12.5)), TODAY)!;
    const r = carryRoll(mk('X', '2036-01-13', 12.5, 0), flat, TODAY)!;
    expect(Math.abs(r.rollDownPct)).toBeLessThan(1e-6);
    expect(r.carryNetPct).toBeCloseTo(r.netReturnPct, 6);
  });

  it('adds up: net return is carry plus roll-down, and tax only touches coupons', () => {
    const b = mk('SUM', '2036-01-13', 12, 0);
    const r = carryRoll(b, fit, TODAY)!;
    expect(r.carryNetPct + r.rollDownPct).toBeCloseTo(r.netReturnPct, 9);
    expect(r.grossReturnPct).toBeGreaterThan(r.netReturnPct);
    // 10-year-plus bonds pay 10% withholding on two 6% coupons: 1.2 per 100 face.
    const dirty0 = dirtyPriceAtYield(b, r.yieldNowPct, TODAY);
    expect(((r.grossReturnPct - r.netReturnPct) / 100) * dirty0).toBeCloseTo(1.2, 6);
  });

  it('cushion is the rise that takes the net return to zero', () => {
    const b = mk('CUSH', '2036-01-13', 12, 0);
    const r = carryRoll(b, fit, TODAY)!;
    expect(r.cushionBp).toBeGreaterThan(0);
    const horizon = new Date(TODAY);
    horizon.setMonth(horizon.getMonth() + 12);
    const dirty0 = dirtyPriceAtYield(b, r.yieldNowPct, TODAY);
    const at = dirtyPriceAtYield(b, r.yieldRolledPct + r.cushionBp / 100, horizon) + 12 * 0.9 - dirty0;
    expect(Math.abs(at)).toBeLessThan(0.01);
  });

  it('a lower-coupon bond has a thinner cushion than a higher-coupon one of equal life', () => {
    const hi = carryRoll(mk('HI', '2036-01-13', 14, 0), fit, TODAY)!;
    const lo = carryRoll(mk('LO', '2036-01-13', 8, 0), fit, TODAY)!;
    expect(hi.cushionBp).toBeGreaterThan(lo.cushionBp);
  });

  it('refuses out-of-scope bonds and ranges the curve does not reach', () => {
    expect(carryRoll(mk('IFB', '2036-01-13', 12, 0, '2026-11-01', { taxExempt: true, category: 'IFB' }), fit, TODAY)).toBeNull();
    expect(carryRoll(mk('SHORT', '2027-07-13', 12, 0), fit, TODAY)).toBeNull();
    expect(carryRoll(mk('LONG', '2070-01-13', 12, 0), fit, TODAY)).toBeNull();
  });
});

describe('shipped data', () => {
  const bonds = bondsData as unknown as Bond[];

  it('fits a usable curve and carries every claim about its own error', () => {
    const table = carryRollTable(bonds, TODAY)!;
    expect(table).not.toBeNull();
    expect(table.fit.n).toBeGreaterThanOrEqual(8);
    expect(table.fit.rmseBp).toBeLessThan(40);
    expect(table.rows.length).toBeGreaterThanOrEqual(10);
    for (const r of table.rows) {
      expect(r.yearsLeft).toBeGreaterThan(table.fit.minYears);
      expect(Number.isFinite(r.netReturnPct)).toBe(true);
      expect(r.cushionBp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('rate-shock scenarios', () => {
  const fit = fitCurve(synthetic(), TODAY)!;
  const bond = mk('SHOCK', '2036-01-13', 12, 0);

  it('a zero shift equals the unchanged-curve return', () => {
    const r = carryRoll(bond, fit, TODAY, 12, 0)!;
    expect(r.shockedNetReturnPct).toBeCloseTo(r.netReturnPct, 9);
  });

  it('rises hurt, falls help, and by more than duration alone says for rises', () => {
    const base = carryRoll(bond, fit, TODAY, 12, 0)!.shockedNetReturnPct;
    const up = carryRoll(bond, fit, TODAY, 12, 100)!.shockedNetReturnPct;
    const down = carryRoll(bond, fit, TODAY, 12, -100)!.shockedNetReturnPct;
    expect(up).toBeLessThan(base);
    expect(down).toBeGreaterThan(base);
    // Convexity: the gain from a fall is larger than the loss from an equal rise.
    expect(down - base).toBeGreaterThan(base - up);
  });

  it('a shift equal to the cushion returns zero', () => {
    const r = carryRoll(bond, fit, TODAY, 12, 0)!;
    const at = carryRoll(bond, fit, TODAY, 12, r.cushionBp)!;
    expect(Math.abs(at.shockedNetReturnPct)).toBeLessThan(0.01);
  });

  it('longer bonds are hit harder by the same rise', () => {
    const near = carryRoll(mk('N', '2033-07-13', 12, 0), fit, TODAY, 12, 200)!;
    const far = carryRoll(mk('F', '2046-01-13', 12, 0), fit, TODAY, 12, 200)!;
    expect(far.shockedNetReturnPct).toBeLessThan(near.shockedNetReturnPct);
  });
});
