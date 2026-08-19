import { describe, expect, it } from 'vitest';
import { buildMacroSummary, longRateBenchmark, shortRateBenchmark } from '../../src/lib/macro-summary';
import type { Bond, MacroIndicator, TBill } from '../../src/types/bond';

const tbills: TBill[] = [
  {
    id: '364',
    tenorDays: 364,
    discountRate: 10.8,
    auctionDate: '2026-08-01',
    nextAuctionDate: '2026-08-08',
    amountOfferedKES: 1,
    amountAcceptedKES: 1,
    minInvestmentKES: 100_000,
    source: 'CBK',
  },
  {
    id: '91',
    tenorDays: 91,
    discountRate: 8.4,
    auctionDate: '2026-08-01',
    nextAuctionDate: '2026-08-08',
    amountOfferedKES: 1,
    amountAcceptedKES: 1,
    minInvestmentKES: 100_000,
    source: 'CBK',
  },
];

const bonds: Bond[] = [
  {
    isin: 'ifb',
    issueCode: 'IFB1/2026/12',
    name: 'IFB',
    category: 'IFB',
    issueDate: '2026-01-01',
    maturityDate: '2038-01-01',
    tenorYears: 12,
    couponRate: 15,
    couponFrequencyPerYear: 2,
    ytmGross: 13.5,
    ytmAsOf: '2026-08-01',
    minInvestmentKES: 100_000,
    taxExempt: true,
  },
  {
    isin: 'short-high',
    issueCode: 'FXD1/2026/02',
    name: 'Short',
    category: 'FXD',
    issueDate: '2026-01-01',
    maturityDate: '2028-01-01',
    tenorYears: 2,
    couponRate: 14,
    couponFrequencyPerYear: 2,
    ytmGross: 16.2,
    ytmAsOf: '2026-08-01',
    minInvestmentKES: 100_000,
    taxExempt: false,
  },
  {
    isin: 'long',
    issueCode: 'FXD1/2026/20',
    name: 'Long',
    category: 'FXD',
    issueDate: '2026-01-01',
    maturityDate: '2046-01-01',
    tenorYears: 20,
    couponRate: 15,
    couponFrequencyPerYear: 2,
    ytmGross: 12.9,
    ytmAsOf: '2026-08-05',
    minInvestmentKES: 100_000,
    taxExempt: false,
  },
];

const macro: MacroIndicator[] = [
  { id: 'cbr-old', indicator: 'CBR', value: 10, date: '2026-07-01', unit: '%', source: 'CBK' },
  { id: 'cbr-new', indicator: 'CBR', value: 9.75, date: '2026-08-01', unit: '%', source: 'CBK' },
  { id: 'cpi-old', indicator: 'CPI', value: 6.2, date: '2026-07-01', unit: '%', source: 'KNBS' },
  { id: 'cpi-new', indicator: 'CPI', value: 5.9, date: '2026-08-01', unit: '%', source: 'KNBS' },
  { id: 'debt-old', indicator: 'DEBT_TO_GDP', value: 66, date: '2025-12-31', unit: '%', source: 'Treasury' },
  { id: 'debt-new', indicator: 'DEBT_TO_GDP', value: 64, date: '2026-06-30', unit: '%', source: 'Treasury' },
  { id: 'em', indicator: 'EM_BOND_YIELD', value: 11.2, date: '2026-08-01', unit: '%', source: 'WB' },
  { id: 'us10y', indicator: 'US10Y', value: 4.3, date: '2026-08-01', unit: '%', source: 'FRED' },
  { id: 'service', indicator: 'DEBT_SERVICE_TO_REVENUE', value: 28, date: '2026-06-30', unit: '%', source: 'Treasury' },
];

describe('macro summary', () => {
  it('anchors the short benchmark to the shortest bill rather than array order', () => {
    expect(shortRateBenchmark(tbills)).toMatchObject({
      label: '91-day T-bill',
      value: 8.4,
    });
  });

  it('anchors the long benchmark to the long end rather than the highest yield', () => {
    expect(longRateBenchmark(bonds)).toMatchObject({
      label: '20-year bond',
      value: 12.9,
      issueCode: 'FXD1/2026/20',
    });
  });

  it('builds shared macro metrics from the same benchmarks', () => {
    const summary = buildMacroSummary(macro, bonds, tbills);
    expect(summary.cbr).toBe(9.75);
    expect(summary.prevCbr).toBe(10);
    expect(summary.realRate).toBeCloseTo(3.85, 6);
    expect(summary.prevRealRate).toBeCloseTo(3.8, 6);
    expect(summary.prevDebt).toBe(66);
    expect(summary.termPremium).toBeCloseTo(4.5, 6);
    expect(summary.kenyaSpread).toBeCloseTo(6.9, 6);
  });
});
