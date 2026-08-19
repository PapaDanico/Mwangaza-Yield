import type { Bond, MacroIndicator, TBill } from '@/types/bond';
import {
  computeDebtSustainabilityIndicators,
  computeKenyaSpread,
  computeRealRate,
  computeTermPremium,
} from './macro-context';

export interface RateBenchmark {
  label: string;
  value: number;
  asOf?: string;
  issueCode?: string;
  tenorYears?: number;
}

function latestRow(macro: MacroIndicator[], indicator: MacroIndicator['indicator']): MacroIndicator | null {
  return (
    [...macro]
      .filter((row) => row.indicator === indicator && Number.isFinite(row.value))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

export function latestIndicatorValue(macro: MacroIndicator[], indicator: MacroIndicator['indicator']): number {
  return latestRow(macro, indicator)?.value ?? 0;
}

export function previousIndicatorValue(macro: MacroIndicator[], indicator: MacroIndicator['indicator']): number {
  const sorted = [...macro]
    .filter((row) => row.indicator === indicator && Number.isFinite(row.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[1]?.value ?? sorted[0]?.value ?? 0;
}

export function shortRateBenchmark(tbills: TBill[]): RateBenchmark | null {
  const bill = [...tbills]
    .filter((row) => Number.isFinite(row.discountRate))
    .sort((a, b) => a.tenorDays - b.tenorDays || b.auctionDate.localeCompare(a.auctionDate))[0];
  if (!bill) return null;
  return {
    label: `${bill.tenorDays}-day T-bill`,
    value: bill.discountRate,
    asOf: bill.auctionDate,
  };
}

export function longRateBenchmark(bonds: Bond[]): RateBenchmark | null {
  const bond = [...bonds]
    .filter((row) => !row.taxExempt && Number.isFinite(row.ytmGross) && row.ytmGross > 0)
    .sort(
      (a, b) =>
        b.tenorYears - a.tenorYears ||
        (b.ytmAsOf ?? b.issueDate).localeCompare(a.ytmAsOf ?? a.issueDate) ||
        b.issueDate.localeCompare(a.issueDate)
    )[0];
  if (!bond) return null;
  return {
    label: `${bond.tenorYears}-year bond`,
    value: bond.ytmGross,
    asOf: bond.ytmAsOf ?? bond.issueDate,
    issueCode: bond.issueCode,
    tenorYears: bond.tenorYears,
  };
}

export function buildMacroSummary(macro: MacroIndicator[], bonds: Bond[], tbills: TBill[]) {
  const cbr = latestIndicatorValue(macro, 'CBR');
  const prevCbr = previousIndicatorValue(macro, 'CBR');
  const cpi = latestIndicatorValue(macro, 'CPI');
  const prevCpi = previousIndicatorValue(macro, 'CPI');
  const fx = latestIndicatorValue(macro, 'FX_USD_KES');
  const us10y = latestIndicatorValue(macro, 'US10Y');
  const fed = latestIndicatorValue(macro, 'US_FED_FUNDS');
  const em = latestIndicatorValue(macro, 'EM_BOND_YIELD');
  const prevDebt = previousIndicatorValue(macro, 'DEBT_TO_GDP');
  const debt = computeDebtSustainabilityIndicators(macro);
  const realRate = computeRealRate(cbr, cpi);
  const prevRealRate = computeRealRate(prevCbr, prevCpi);
  const shortBenchmark = shortRateBenchmark(tbills);
  const longBenchmark = longRateBenchmark(bonds);
  const termPremium = computeTermPremium(longBenchmark?.value ?? 0, shortBenchmark?.value ?? 0);
  const kenyaSpread = computeKenyaSpread(em || longBenchmark?.value || 0, us10y || fed);

  return {
    cbr,
    prevCbr,
    cpi,
    prevCpi,
    fx,
    us10y,
    fed,
    em,
    debt,
    prevDebt,
    realRate,
    prevRealRate,
    shortBenchmark,
    longBenchmark,
    termPremium,
    kenyaSpread,
  };
}
