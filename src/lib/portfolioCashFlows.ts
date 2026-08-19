import type { Bond, Holding } from '../types/bond';
import type { InvestmentResult } from './financial-engine';
import { getCouponDates } from './financial-engine';
import { paymentDay } from './holidays';

export interface PortfolioPaymentEvent {
  id: string;
  holdingId: string;
  issueCode: string;
  bondName: string;
  paymentDate: string;
  scheduledDate: string;
  couponAmountKES: number;
  principalAmountKES: number;
  totalAmountKES: number;
  remainingBalanceKES: number;
  kind: 'coupon' | 'maturity';
}

export interface WaterfallPoint {
  label: string;
  monthStart: string;
  coupons: number;
  principal: number;
  total: number;
  runningBalance: number;
}

export function buildPortfolioPaymentSchedule(
  holdings: Array<{
    holding: Holding;
    bond: Bond | null;
    result: Pick<InvestmentResult, 'netCouponPerPeriodKES'> | null;
  }>,
  asOf: Date = new Date(),
): PortfolioPaymentEvent[] {
  const events: PortfolioPaymentEvent[] = [];
  for (const entry of holdings) {
    const { bond, holding, result } = entry;
    if (!bond || !result) continue;
    const maturityISO = new Date(bond.maturityDate).toISOString().slice(0, 10);
    const dates = getCouponDates(
      new Date(bond.issueDate),
      new Date(bond.maturityDate),
      bond.couponFrequencyPerYear || 2,
    ).filter((date) => date.getTime() > asOf.getTime());

    for (const date of dates) {
      const scheduledDate = date.toISOString().slice(0, 10);
      const moved = paymentDay(scheduledDate);
      const isMaturity = scheduledDate === maturityISO;
      const principalAmountKES = isMaturity ? holding.faceValueKES : 0;
      events.push({
        id: `${holding.id}-${scheduledDate}`,
        holdingId: holding.id,
        issueCode: holding.issueCode,
        bondName: bond.name,
        paymentDate: moved.paid,
        scheduledDate,
        couponAmountKES: result.netCouponPerPeriodKES,
        principalAmountKES,
        totalAmountKES: result.netCouponPerPeriodKES + principalAmountKES,
        remainingBalanceKES: isMaturity ? 0 : holding.faceValueKES,
        kind: isMaturity ? 'maturity' : 'coupon',
      });
    }
  }

  return events.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.issueCode.localeCompare(b.issueCode));
}

export function buildWaterfallSeries(
  events: PortfolioPaymentEvent[],
  months: number,
  reinvestmentRate: number,
  from: Date = new Date(),
): WaterfallPoint[] {
  const monthStarts = Array.from({ length: months }, (_, index) => new Date(from.getFullYear(), from.getMonth() + index, 1));
  let runningBalance = 0;
  const monthlyRate = reinvestmentRate / 100 / 12;

  return monthStarts.map((monthStart) => {
    const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
    const monthEvents = events.filter((event) => event.paymentDate.startsWith(monthKey));
    const coupons = monthEvents.reduce((sum, event) => sum + event.couponAmountKES, 0);
    const principal = monthEvents.reduce((sum, event) => sum + event.principalAmountKES, 0);
    const total = coupons + principal;
    runningBalance = runningBalance * (1 + monthlyRate) + total;
    return {
      label: monthStart.toLocaleString('en-KE', { month: 'short', year: '2-digit' }),
      monthStart: monthStart.toISOString().slice(0, 10),
      coupons,
      principal,
      total,
      runningBalance,
    };
  });
}
