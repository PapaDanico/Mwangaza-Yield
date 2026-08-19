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

export function trendArrow(current: number, previous: number): '▲' | '▼' | '→' {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return '→';
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
