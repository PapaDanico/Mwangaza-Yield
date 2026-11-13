import { describe, expect, it } from 'vitest';
import type { Bond } from '../../src/types/bond';
import type { LadderPlan } from '../../src/lib/ladder';
import { ladderCashFlowRows, ladderCsv } from '../../src/lib/ladder-cashflows';

const TODAY = new Date('2026-11-13T09:00:00Z');
function bond(code: string, maturity: string): Bond {
  const issue = new Date(new Date(maturity).getTime() - 40 * 182 * 86_400_000).toISOString().slice(0, 10);
  return { isin: `KE-${code}`, issueCode: code, name: code, category: 'FXD', issueDate: issue, maturityDate: maturity, tenorYears: 10,
    couponRate: 12, couponFrequencyPerYear: 2, ytmGross: 12, minInvestmentKES: 50000, taxExempt: false, source: 'https://www.centralbank.go.ke/' } as Bond;
}
function plan(source: 'par' | 'market'): LadderPlan {
  const mk = (code: string, mat: string) => ({
    bond: bond(code, mat), faceValueKES: 1_000_000, price: 100,
    priceInfo: { price: 100, source, asOfDate: '2026-11-01', ageDays: 12, stale: false } as never,
    result: { netCouponPerPeriodKES: 54_000 } as never,
  });
  return { rungs: [mk('A', '2027-03-15'), mk('B', '2031-01-07')], totalCostKES: 2_000_000, blendedNetYTM: 10, netAnnualIncomeKES: 0,
    nextTwelveMonthsNetIncomeKES: 0, yearlyPayouts: [], unallocatedKES: 0, priceCoverage: {} as never };
}

describe('ladder cash flows', () => {
  it('lists only future payments, sorted by the day the money lands, principal only at maturity', () => {
    const rows = ladderCashFlowRows(plan('market'), TODAY);
    expect(rows.every((r) => r.scheduled > '2026-11-13')).toBe(true);
    expect([...rows].sort((a, b) => a.paid.localeCompare(b.paid))).toEqual(rows);
    const a = rows.filter((r) => r.issueCode === 'A');
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe('maturity');
    expect(a[0].principalKES).toBe(1_000_000);
    expect(a[0].totalKES).toBe(1_054_000);
    expect(rows.filter((r) => r.kind === 'coupon').every((r) => r.principalKES === 0)).toBe(true);
  });
  it('the paid date is never before the scheduled one and never a weekend', () => {
    for (const r of ladderCashFlowRows(plan('market'), TODAY)) {
      expect(r.paid >= r.scheduled).toBe(true);
      const dow = new Date(`${r.paid}T00:00:00Z`).getUTCDay();
      expect(dow === 0 || dow === 6).toBe(false);
    }
  });
  it('the CSV states its assumptions, names a par placeholder, and totals reconcile', () => {
    const csv = ladderCsv(plan('par'), '2026-11-13', TODAY);
    expect(csv).toMatch(/^# Mwangaza Yield/);
    expect(csv).toMatch(/NET of withholding tax/);
    expect(csv).toMatch(/par placeholder/);
    expect(csv).toMatch(/WARNING/);
    const lines = csv.trim().split('\n').filter((l) => !l.startsWith('#'));
    expect(lines[0]).toMatch(/^paid,scheduled/);
    const sum = lines.slice(1).reduce((s, l) => s + Number(l.split(',')[6]), 0);
    const rows = ladderCashFlowRows(plan('par'), TODAY);
    expect(sum).toBeCloseTo(rows.reduce((s, r) => s + r.totalKES, 0), 2);
  });
  it('no warning when every rung has a real price', () => {
    expect(ladderCsv(plan('market'), '2026-11-13', TODAY)).not.toMatch(/WARNING/);
  });
});
