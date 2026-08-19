import { describe, expect, it } from 'vitest';
import {
  computeIncomeGaps,
  computeIncomeStabilityScore,
  computeMonthlyIncomeDistribution,
  suggestSwaps,
} from '../../src/lib/income-stability';

const bond = {
  isin: 'X',
  issueCode: 'FXD1/2024/10',
  name: 'Bond',
  category: 'FXD',
  issueDate: '2024-01-01',
  maturityDate: '2030-01-01',
  tenorYears: 10,
  couponRate: 12,
  couponFrequencyPerYear: 2,
  ytmGross: 12,
  minInvestmentKES: 50000,
  taxExempt: false,
} as any;

const holding = {
  id: 'h1',
  isin: 'X',
  issueCode: 'FXD1/2024/10',
  faceValueKES: 100000,
  purchaseDate: '2025-01-01',
  purchaseCleanPrice: 100,
} as any;

describe('incomeStability', () => {
  it('computes distribution and score', () => {
    const d = computeMonthlyIncomeDistribution([{ bond, holding }]);
    expect(d).toHaveLength(12);
    const s = computeIncomeStabilityScore(d);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('finds gaps and swap ideas', () => {
    const gaps = computeIncomeGaps([0, 10, 0], 50);
    expect(gaps.length).toBeGreaterThan(0);
    const swaps = suggestSwaps([{ bond, holding }], [bond], 10000);
    expect(swaps.length).toBeGreaterThan(0);
  });
});
