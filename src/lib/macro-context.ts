import type { MacroIndicator } from '@/types/bond';

export type MacroData = MacroIndicator[];

function latestValue(macro: MacroData, indicator: string): number | null {
  const rows = macro
    .filter((m) => m.indicator === indicator && Number.isFinite(m.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return rows[0]?.value ?? null;
}

export function computeDebtSustainabilityIndicators(macro: MacroData): {
  debtToGDP: number;
  debtServiceRatio: number;
  fiscalSpace: number;
} {
  const debtToGDP = latestValue(macro, 'DEBT_TO_GDP') ?? 0;
  const debtServiceRatio =
    latestValue(macro, 'DEBT_SERVICE_TO_REVENUE') ??
    latestValue(macro, 'INTEREST_TO_REVENUE') ??
    0;

  // Higher debt and debt-service imply lower fiscal space.
  const debtPressure = Math.min(100, debtToGDP);
  const servicePressure = Math.min(100, debtServiceRatio);
  const fiscalSpace = Math.max(0, 100 - debtPressure * 0.6 - servicePressure * 0.4);

  return { debtToGDP, debtServiceRatio, fiscalSpace };
}

export function computeRealRate(cbr: number, cpi: number): number {
  if (!Number.isFinite(cbr) || !Number.isFinite(cpi)) return 0;
  return cbr - cpi;
}

export function computeTermPremium(longYield: number, shortYield: number): number {
  if (!Number.isFinite(longYield) || !Number.isFinite(shortYield)) return 0;
  return longYield - shortYield;
}

export function computeKenyaSpread(emYield: number, usYield: number): number {
  if (!Number.isFinite(emYield) || !Number.isFinite(usYield)) return 0;
  return emYield - usYield;
}

/**
 * Which way an indicator moved — or `null` when we have nothing to compare to.
 *
 * NULL IS NOT THE SAME AS FLAT, AND CONFLATING THEM SHIPPED A FALSE CLAIM.
 *
 * This used to return '→' whenever the previous value was missing or unusable.
 * macro.json holds exactly ONE row per indicator by design — it is the current
 * state of each figure, not a series — so `previousIndicatorValue` never found
 * a second row, fell back to the latest, and every arrow on the dashboard and
 * the macro page rendered '→'. Six of them, permanently flat.
 *
 * Flat is a claim: it says the figure was measured before and has not moved.
 * The CBR had in fact moved. We simply were not reading the file that knows —
 * the series live in cbr-history.json and cpi-history.json. Rendering
 * "unchanged" over an unread history is the same defect this project keeps
 * finding in itself: a confident statement standing in for an absent check.
 *
 * So an unknown previous value now renders no arrow at all. Silence is the
 * honest answer, and it is visibly different from a claim of no change.
 */
export function trendArrow(
  current: number,
  previous: number | null | undefined
): '▲' | '▼' | '→' | null {
  if (!Number.isFinite(current)) return null;
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return '→';
  return diff > 0 ? '▲' : '▼';
}

export function sustainabilitySignal(debtToGDP: number, debtServiceRatio: number): 'green' | 'yellow' | 'red' {
  // Simple IMF-style guardrails: debt below 55 and debt service below 25 = healthier.
  if (debtToGDP < 55 && debtServiceRatio < 25) return 'green';
  if (debtToGDP < 70 && debtServiceRatio < 35) return 'yellow';
  return 'red';
}
