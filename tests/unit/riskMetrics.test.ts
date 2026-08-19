import { describe, expect, it } from 'vitest';
import type { Bond } from '../../src/types/bond';
import {
  buildBondCashFlows,
  computeBondRiskMetrics,
  computeConvexity,
  computeMacaulayDuration,
  computeModifiedDuration,
  computePortfolioWeightedDuration,
  computePriceSensitivity,
  type CashFlow,
} from '../../src/lib/riskMetrics';

const fiveYearBond: Bond = {
  isin: 'KE0000000001',
  issueCode: 'FXD1/2024/5',
  name: 'Five Year Bond',
  category: 'FXD',
  issueDate: '2024-02-12',
  maturityDate: '2029-02-05',
  tenorYears: 5,
  couponRate: 10,
  couponFrequencyPerYear: 2,
  ytmGross: 8,
  minInvestmentKES: 50_000,
  taxExempt: false,
};

const tenYearBond: Bond = {
  ...fiveYearBond,
  isin: 'KE0000000002',
  issueCode: 'FXD1/2024/10',
  tenorYears: 10,
  maturityDate: '2034-01-30',
};

describe('risk metrics', () => {
  it('matches the standard textbook 5-year 10% coupon, 8% YTM example closely', () => {
    const cashFlows: CashFlow[] = Array.from({ length: 10 }, (_, index) => ({
      amount: index === 9 ? 105 : 5,
      timeInYears: (index + 1) / 2,
    }));
    const macaulay = computeMacaulayDuration(cashFlows, 8);
    const modified = computeModifiedDuration(macaulay, 8, 2);
    const convexity = computeConvexity(cashFlows, 8);

    expect(macaulay).toBeGreaterThan(4.05);
    expect(macaulay).toBeLessThan(4.12);
    expect(modified).toBeCloseTo(3.94, 2);
    expect(convexity).toBeCloseTo(19.37, 1);
  });

  it('applies Kenyan coupon tax rules when building cash flows', () => {
    const fiveYearFlows = buildBondCashFlows(fiveYearBond, 100_000, new Date('2024-02-12'));
    const tenYearFlows = buildBondCashFlows(tenYearBond, 100_000, new Date('2024-02-12'));
    const ifbFlows = buildBondCashFlows({ ...tenYearBond, taxExempt: true }, 100_000, new Date('2024-02-12'));

    expect(fiveYearFlows[0].amount).toBeCloseTo(4_250, 2);
    expect(tenYearFlows[0].amount).toBeCloseTo(4_500, 2);
    expect(ifbFlows[0].amount).toBeCloseTo(5_000, 2);
  });

  it('computes bond-level duration and convexity from actual portfolio-style bond data', () => {
    const metrics = computeBondRiskMetrics(fiveYearBond, 100_000, 8, new Date('2024-02-12'));

    expect(metrics.cashFlows).toHaveLength(10);
    expect(metrics.macaulayDuration).toBeGreaterThan(4);
    expect(metrics.modifiedDuration).toBeLessThan(metrics.macaulayDuration);
    expect(metrics.convexity).toBeGreaterThan(18);
  });

  it('computes portfolio-weighted duration across multiple holdings', () => {
    const weighted = computePortfolioWeightedDuration([
      { marketValue: 100_000, duration: 4 },
      { marketValue: 300_000, duration: 8 },
      { marketValue: 0, duration: 99 },
    ]);

    expect(weighted).toBeCloseTo(7, 8);
  });

  it('estimates price sensitivity for rate shocks', () => {
    const impact = computePriceSensitivity(3.9379, 19.3705, 1, 108.1109);

    expect(impact.percentChange).toBeCloseTo(-3.84, 2);
    expect(impact.priceChange).toBeCloseTo(-4.15, 2);
    expect(impact.estimatedPrice).toBeCloseTo(103.96, 2);
  });
});
