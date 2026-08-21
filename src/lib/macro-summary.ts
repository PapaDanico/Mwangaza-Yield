import type { Bond, MacroIndicator, RateDecision, TBill } from '@/types/bond';
import type { CpiPoint } from './db';
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

/**
 * The previous observation of an indicator, or `null` if this file has only one.
 *
 * It used to fall back to the LATEST value when there was no second row, which
 * made every caller believe the figure had not moved. macro.json carries one
 * row per indicator, so that fallback was not an edge case — it was the only
 * path. See the note on `trendArrow`.
 */
export function previousIndicatorValue(
  macro: MacroIndicator[],
  indicator: MacroIndicator['indicator']
): number | null {
  const sorted = [...macro]
    .filter((row) => row.indicator === indicator && Number.isFinite(row.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[1]?.value ?? null;
}

/**
 * The CBR set at the meeting BEFORE the latest one.
 *
 * macro.json holds the current CBR and nothing else — it is a state file, not
 * a series — so a "previous" value has to come from cbr-history.json, which
 * carries every MPC decision back to 2008 and is already loaded into the
 * store. Reading the wrong file is why six trend arrows on this app rendered
 * a permanent "unchanged" while claiming to show movement.
 *
 * A hold is a real answer, not a missing one: two consecutive decisions at the
 * same rate mean the Committee met and left it there, which is exactly what a
 * flat arrow should say. Only an absent second decision returns null.
 */
export function previousPolicyRate(cbrHistory: RateDecision[]): number | null {
  const sorted = [...cbrHistory]
    .filter((d) => d && typeof d.date === 'string' && Number.isFinite(d.rate))
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[1]?.rate ?? null;
}

/**
 * The CPI print for the month before `period` (YYYY-MM).
 *
 * Compares against the previous MONTH rather than the previous row, because
 * the displayed figure is dated when it was scraped while the series is dated
 * by reference month. macro.json's CPI carries `period` for exactly this — the
 * 5 August scrape reports July — so matching on it is what keeps "previous"
 * meaning the month before the one on screen.
 *
 * Falls back to the second-most-recent point when no period is recorded, which
 * is the same question asked less precisely rather than a different one.
 */
export function previousCpiPrint(
  cpiHistory: CpiPoint[],
  period?: string
): number | null {
  const sorted = [...cpiHistory]
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!period) return sorted[1]?.value ?? null;
  const earlier = sorted.find((p) => p.date.slice(0, 7) < period);
  return earlier?.value ?? null;
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

export function buildMacroSummary(
  macro: MacroIndicator[],
  bonds: Bond[],
  tbills: TBill[],
  cbrHistory: RateDecision[] = [],
  cpiHistory: CpiPoint[] = []
) {
  const cbrRow = latestRow(macro, 'CBR');
  const cpiRow = latestRow(macro, 'CPI');
  const fxRow = latestRow(macro, 'FX_USD_KES');
  const us10yRow = latestRow(macro, 'US10Y');
  const fedRow = latestRow(macro, 'US_FED_FUNDS');
  const emRow = latestRow(macro, 'EM_BOND_YIELD');
  const cbr = cbrRow?.value ?? 0;
  // History first, macro.json second. The latter can only ever answer null —
  // it holds one row per indicator — so it is the fallback, not the source.
  const prevCbr = previousPolicyRate(cbrHistory) ?? previousIndicatorValue(macro, 'CBR');
  const cpi = cpiRow?.value ?? 0;
  const prevCpi =
    previousCpiPrint(cpiHistory, cpiRow?.period) ?? previousIndicatorValue(macro, 'CPI');
  const fx = fxRow?.value ?? 0;
  const us10y = us10yRow?.value ?? null;
  const fed = fedRow?.value ?? null;
  const em = emRow?.value ?? null;
  const prevDebt = previousIndicatorValue(macro, 'DEBT_TO_GDP');
  const debt = computeDebtSustainabilityIndicators(macro);
  const realRate = computeRealRate(cbr, cpi);
  const prevRealRate =
    prevCbr === null || prevCpi === null ? null : computeRealRate(prevCbr, prevCpi);
  const shortBenchmark = shortRateBenchmark(tbills);
  const longBenchmark = longRateBenchmark(bonds);
  const termPremium = computeTermPremium(
    longBenchmark?.value ?? null,
    shortBenchmark?.value ?? null
  );
  const kenyaSpread = computeKenyaSpread(
    emRow?.value ?? longBenchmark?.value ?? null,
    us10yRow?.value ?? fedRow?.value ?? null
  );

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
