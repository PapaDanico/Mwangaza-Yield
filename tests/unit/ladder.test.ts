import { describe, it, expect } from 'vitest';
import { buildLadder } from '../../src/lib/ladder';
import { buildICS } from '../../src/lib/ics';
import type { Bond } from '../../src/types/bond';

const asOf = new Date('2026-07-24');

function mkBond(code: string, maturity: string, coupon: number, taxExempt = false, min = 50_000): Bond {
  return {
    isin: `KE-${code.replace(/\//g, '-')}`,
    issueCode: code,
    name: code,
    category: taxExempt ? 'IFB' : 'FXD',
    issueDate: '2022-01-10',
    maturityDate: maturity,
    tenorYears: 10,
    couponRate: coupon,
    couponFrequencyPerYear: 2,
    ytmGross: coupon,
    minInvestmentKES: min,
    taxExempt,
  };
}

const universe = [
  mkBond('FXD1/2022/A', '2028-06-10', 13.0),
  mkBond('FXD1/2022/B', '2030-06-10', 13.5),
  mkBond('IFB1/2022/C', '2032-06-10', 12.9, true, 100_000),
  mkBond('FXD1/2022/D', '2032-11-10', 12.0), // same year as IFB, lower net → IFB should win 2032
  mkBond('FXD1/2022/E', '2045-06-10', 14.0), // beyond horizon
];

describe('buildLadder', () => {
  const plan = buildLadder(universe, [], 3_000_000, 7, 5, asOf);

  it('spreads across distinct maturity years within horizon', () => {
    expect(plan.rungs.length).toBe(3);
    const years = plan.rungs.map((r) => r.bond.maturityDate.slice(0, 4));
    expect(new Set(years).size).toBe(3);
    expect(years).not.toContain('2045');
  });

  it('picks the higher-net-yield bond in a contested year', () => {
    const y2032 = plan.rungs.find((r) => r.bond.maturityDate.startsWith('2032'));
    expect(y2032?.bond.issueCode).toBe('IFB1/2022/C'); // tax-free beats 12% taxable
  });

  it('allocates in 50k steps and computes blended stats', () => {
    for (const r of plan.rungs) expect(r.faceValueKES % 50_000).toBe(0);
    expect(plan.totalCostKES).toBeGreaterThan(0);
    expect(plan.blendedNetYTM).toBeGreaterThan(10);
    expect(plan.netAnnualIncomeKES).toBeGreaterThan(0);
  });

  it('yearly payouts include principal in maturity years', () => {
    const y2028 = plan.yearlyPayouts.find((p) => p.year === 2028);
    expect(y2028?.principalKES).toBe(plan.rungs[0].faceValueKES);
  });

  it('drops rungs that cannot meet bond minimums', () => {
    // 150k over candidates incl. a 100k-minimum IFB: per-rung 50k < 100k → IFB dropped.
    const small = buildLadder(universe, [], 150_000, 7, 5, asOf);
    expect(small.rungs.every((r) => r.faceValueKES >= r.bond.minInvestmentKES)).toBe(true);
  });

  it('empty when nothing matures within horizon', () => {
    const none = buildLadder([mkBond('FXD1/2022/Z', '2050-01-01', 14)], [], 1_000_000, 5, 5, asOf);
    expect(none.rungs.length).toBe(0);
    expect(none.unallocatedKES).toBe(1_000_000);
  });
});

describe('buildICS', () => {
  it('produces a valid all-day VEVENT with alarm', () => {
    const ics = buildICS([{ date: '2026-11-16', title: 'FXD1/2022/10 coupon', description: 'Net KES 60,705' }]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261116');
    expect(ics).toContain('SUMMARY:FXD1/2022/10 coupon');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('END:VCALENDAR');
  });
});
