import { describe, it, expect } from 'vitest';
import bonds from '../../public/data/bonds.json';
import type { Bond } from '../../src/types/bond';
import { analyseSwitch, dirtyPriceAtYield } from '../../src/lib/switch';

const find = (code: string) => (bonds as Bond[]).find((b) => b.issueCode === code)!;
const source = find('FXD1/2023/005');
const dest = find('FXD4/2019/010');
const settlement = '2026-11-11';

// CBK prospectus, switch into FXD4/2019/010 DATED 11-11-2026 (revised).
const base = {
  source, dest, sourceFaceKES: 1_000_000, settlement,
  sourcePricePer100: 115.8913, destYieldPct: 12.28, reinvestPct: 8,
};

describe('switch pricing reproduces the prospectus', () => {
  it("prices the destination exactly as CBK's worked example", () => {
    const r = analyseSwitch(base);
    expect(r.destAccruedPer100).toBeCloseTo(5.9713, 3);
    expect(r.destCleanPer100).toBeCloseTo(99.9951, 3);
    expect(r.destDirtyPer100).toBeCloseTo(105.9664, 3);
  });

  it('reads the source price as dirty: 115.8913 is the quoted 9.9627%', () => {
    expect(dirtyPriceAtYield(source, 9.9627, new Date(settlement))).toBeCloseTo(115.8913, 2);
  });

  it("matches the pricing table's clean price at another yield", () => {
    const r = analyseSwitch({ ...base, destYieldPct: 13 });
    expect(r.destCleanPer100).toBeCloseTo(98.2455, 2);
  });
});

describe('the comparison', () => {
  it('conserves money: proceeds buy exactly their worth of the destination', () => {
    const r = analyseSwitch(base);
    expect(r.proceedsKES).toBeCloseTo(1_158_913, 0);
    expect((r.destFaceKES * r.destDirtyPer100) / 100).toBeCloseTo(r.proceedsKES, 4);
  });

  it('runs both paths to the later maturity and taxes each at its own rate', () => {
    const r = analyseSwitch(base);
    expect(r.horizon).toBe(dest.maturityDate);
    expect(r.keep.whtRate).toBe(0.15);
    expect(r.switched.whtRate).toBe(0.1);
    expect(r.keep.principalKES).toBeCloseTo(1_000_000, 0);
    expect(r.switched.principalKES).toBeCloseTo(r.destFaceKES, 0);
  });

  it('a higher reinvestment rate favours keeping, and the breakeven sits between', () => {
    const low = analyseSwitch({ ...base, reinvestPct: 4 });
    const high = analyseSwitch({ ...base, reinvestPct: 20 });
    expect(low.advantageKES).toBeGreaterThan(high.advantageKES);
    const be = analyseSwitch(base).breakevenReinvestPct;
    if (be !== null) {
      expect(Math.abs(analyseSwitch({ ...base, reinvestPct: be }).advantageKES)).toBeLessThan(1);
    }
  });

  it('a better bid on the destination always helps the switch', () => {
    expect(analyseSwitch({ ...base, destYieldPct: 13 }).advantageKES).toBeGreaterThan(
      analyseSwitch(base).advantageKES
    );
  });
});
