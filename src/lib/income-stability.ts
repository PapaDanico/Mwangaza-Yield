import type { Bond, Holding } from '../types/bond';
import { getCouponDates, computeBondInvestment } from './financial-engine';

export interface PortfolioHolding {
  holding: Holding;
  bond: Bond | null;
}

export interface Gap {
  monthIndex: number;
  label: string;
  income: number;
  target: number;
  shortfall: number;
}

export interface SwapRecommendation {
  action: 'buy' | 'sell';
  issueCode: string;
  reason: string;
  estimatedImpact: number;
}

function monthLabel(i: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
  return d.toLocaleDateString('en-KE', { month: 'short' });
}

export function computeMonthlyIncomeDistribution(portfolio: PortfolioHolding[]): number[] {
  const now = new Date();
  const out = new Array<number>(12).fill(0);

  for (const entry of portfolio) {
    const { bond, holding } = entry;
    if (!bond) continue;

    const inv = computeBondInvestment(bond, holding.faceValueKES, holding.purchaseCleanPrice || 100, now);
    const dates = getCouponDates(
      new Date(bond.issueDate),
      new Date(bond.maturityDate),
      bond.couponFrequencyPerYear || 2,
    ).filter((d) => d > now);

    for (const dt of dates) {
      const monthsOut = (dt.getFullYear() - now.getFullYear()) * 12 + (dt.getMonth() - now.getMonth());
      if (monthsOut >= 0 && monthsOut < 12) {
        out[monthsOut] += inv.netCouponPerPeriodKES;
        const isMaturity = dt.toISOString().slice(0, 10) === bond.maturityDate;
        if (isMaturity) out[monthsOut] += holding.faceValueKES;
      }
    }
  }

  return out.map((v) => Number(v.toFixed(2)));
}

export function computeIncomeStabilityScore(distribution: number[]): number {
  if (!distribution.length) return 0;
  const mean = distribution.reduce((s, n) => s + n, 0) / distribution.length;
  if (mean <= 0) return 0;
  const variance = distribution.reduce((s, n) => s + (n - mean) ** 2, 0) / distribution.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  const score = 100 * (1 / (1 + cv));
  return Math.max(0, Math.min(100, Number(score.toFixed(1))));
}

export function computeIncomeGaps(distribution: number[], targetMonthly: number): Gap[] {
  return distribution
    .map((income, idx) => ({
      monthIndex: idx,
      label: monthLabel(idx),
      income,
      target: targetMonthly,
      shortfall: Math.max(0, targetMonthly - income),
    }))
    .filter((g) => g.shortfall > 0);
}

export function suggestSwaps(portfolio: PortfolioHolding[], availableBonds: Bond[], target: number): SwapRecommendation[] {
  const distribution = computeMonthlyIncomeDistribution(portfolio);
  const gaps = computeIncomeGaps(distribution, target);
  if (!gaps.length) return [];

  const underMonths = new Set(gaps.map((g) => g.monthIndex));
  const suggestions: SwapRecommendation[] = [];

  const sortedBuy = [...availableBonds]
    .filter((b) => new Date(b.maturityDate) > new Date())
    .sort((a, b) => b.couponRate - a.couponRate)
    .slice(0, 3);

  for (const bond of sortedBuy) {
    const dates = getCouponDates(new Date(bond.issueDate), new Date(bond.maturityDate), bond.couponFrequencyPerYear || 2)
      .filter((d) => d > new Date());

    const helpful = dates.some((d) => {
      const idx = (d.getFullYear() - new Date().getFullYear()) * 12 + (d.getMonth() - new Date().getMonth());
      return underMonths.has(idx);
    });

    if (helpful) {
      suggestions.push({
        action: 'buy',
        issueCode: bond.issueCode,
        reason: 'Adds coupon dates in months where projected income is below target',
        estimatedImpact: Number((bond.couponRate / 2).toFixed(2)),
      });
    }
  }

  const sellCandidates = portfolio
    .filter((p) => p.bond)
    .sort((a, b) => (a.bond?.couponRate ?? 0) - (b.bond?.couponRate ?? 0))
    .slice(0, 2);

  for (const entry of sellCandidates) {
    if (!entry.bond) continue;
    suggestions.push({
      action: 'sell',
      issueCode: entry.bond.issueCode,
      reason: 'Lower coupon bond with weaker income support for target months',
      estimatedImpact: Number(entry.bond.couponRate.toFixed(2)),
    });
  }

  return suggestions.slice(0, 5);
}
