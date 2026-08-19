import type { Bond } from '@/types/bond';
import { determineWHTRate, getCouponDates } from '@/lib/financial-engine';

const DAY_MS = 86_400_000;
const DAYS_IN_YEAR = 365;

export interface CashFlow {
  amount: number;
  /** Actual/365 from the valuation date to this payment. */
  timeInYears: number;
  paymentDate?: string;
  kind?: 'coupon' | 'redemption' | 'coupon+redemption';
}

export interface PriceImpact {
  yieldChange: number;
  percentChange: number;
  priceChange: number;
  estimatedPrice: number;
}

export interface PortfolioHolding {
  marketValue: number;
  duration: number;
}

export interface BondRiskMetrics {
  cashFlows: CashFlow[];
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
}

function toRate(value: number): number {
  return value / 100;
}

function inferFrequency(cashFlows: CashFlow[]): number {
  if (cashFlows.length < 2) return 2;
  const gaps = cashFlows
    .slice(1)
    .map((flow, index) => flow.timeInYears - cashFlows[index].timeInYears)
    .filter((gap) => gap > 0);
  if (!gaps.length) return 2;
  const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (avg <= 0.12) return 12;
  if (avg <= 0.3) return 4;
  if (avg <= 0.75) return 2;
  return 1;
}

function presentValue(cashFlows: CashFlow[], yieldToMaturity: number, frequency: number): number {
  const rate = toRate(yieldToMaturity);
  return cashFlows.reduce(
    (sum, flow) => sum + flow.amount / Math.pow(1 + rate / frequency, flow.timeInYears * frequency),
    0,
  );
}

export function computeMacaulayDuration(cashFlows: CashFlow[], yieldToMaturity: number): number {
  if (!cashFlows.length) return 0;
  const frequency = inferFrequency(cashFlows);
  const price = presentValue(cashFlows, yieldToMaturity, frequency);
  if (price <= 0) return 0;
  const rate = toRate(yieldToMaturity);
  const weighted = cashFlows.reduce((sum, flow) => {
    const pv = flow.amount / Math.pow(1 + rate / frequency, flow.timeInYears * frequency);
    return sum + flow.timeInYears * pv;
  }, 0);
  return weighted / price;
}

export function computeModifiedDuration(macaulayDuration: number, ytm: number, frequency: number): number {
  if (!(macaulayDuration > 0) || !(frequency > 0)) return 0;
  return macaulayDuration / (1 + toRate(ytm) / frequency);
}

export function computeConvexity(cashFlows: CashFlow[], ytm: number): number {
  if (!cashFlows.length) return 0;
  const frequency = inferFrequency(cashFlows);
  const rate = toRate(ytm);
  const price = presentValue(cashFlows, ytm, frequency);
  if (price <= 0) return 0;
  const convexity = cashFlows.reduce((sum, flow) => {
    const periods = flow.timeInYears * frequency;
    return (
      sum
      + (flow.amount * periods * (periods + 1))
        / Math.pow(1 + rate / frequency, periods + 2)
    );
  }, 0);
  return convexity / (price * frequency * frequency);
}

export function computePriceSensitivity(
  modifiedDuration: number,
  convexity: number,
  yieldChange: number,
  currentPrice: number,
): PriceImpact {
  const deltaYield = toRate(yieldChange);
  const percentChange = -modifiedDuration * deltaYield + 0.5 * convexity * deltaYield * deltaYield;
  const priceChange = currentPrice * percentChange;
  return {
    yieldChange,
    percentChange: percentChange * 100,
    priceChange,
    estimatedPrice: currentPrice + priceChange,
  };
}

export function computePortfolioWeightedDuration(holdings: PortfolioHolding[]): number {
  const total = holdings.reduce((sum, holding) => sum + Math.max(holding.marketValue, 0), 0);
  if (total <= 0) return 0;
  return holdings.reduce(
    (sum, holding) => sum + Math.max(holding.marketValue, 0) * holding.duration,
    0,
  ) / total;
}

export function buildBondCashFlows(
  bond: Pick<
    Bond,
    'couponRate' | 'couponFrequencyPerYear' | 'issueDate' | 'maturityDate' | 'taxExempt' | 'tenorYears'
  >,
  faceValueKES: number,
  asOf: Date = new Date(),
): CashFlow[] {
  const frequency = bond.couponFrequencyPerYear || 2;
  const couponDates = getCouponDates(new Date(bond.issueDate), new Date(bond.maturityDate), frequency);
  const whtRate = determineWHTRate(bond);
  const couponAmount = (faceValueKES * bond.couponRate) / 100 / frequency;
  const netCoupon = couponAmount * (1 - whtRate);
  const maturityISO = new Date(bond.maturityDate).toISOString().slice(0, 10);

  return couponDates
    .filter((date) => date.getTime() > asOf.getTime())
    .map((date) => {
      const paymentDate = date.toISOString().slice(0, 10);
      const redeems = paymentDate === maturityISO;
      return {
        amount: netCoupon + (redeems ? faceValueKES : 0),
        timeInYears: (date.getTime() - asOf.getTime()) / DAY_MS / DAYS_IN_YEAR,
        paymentDate,
        kind: redeems ? 'coupon+redemption' : 'coupon',
      } satisfies CashFlow;
    });
}

export function computeBondRiskMetrics(
  bond: Pick<
    Bond,
    'couponRate' | 'couponFrequencyPerYear' | 'issueDate' | 'maturityDate' | 'taxExempt' | 'tenorYears'
  >,
  faceValueKES: number,
  yieldToMaturity: number,
  asOf: Date = new Date(),
): BondRiskMetrics {
  const cashFlows = buildBondCashFlows(bond, faceValueKES, asOf);
  const macaulayDuration = computeMacaulayDuration(cashFlows, yieldToMaturity);
  const modifiedDuration = computeModifiedDuration(
    macaulayDuration,
    yieldToMaturity,
    bond.couponFrequencyPerYear || 2,
  );
  const convexity = computeConvexity(cashFlows, yieldToMaturity);
  return { cashFlows, macaulayDuration, modifiedDuration, convexity };
}
