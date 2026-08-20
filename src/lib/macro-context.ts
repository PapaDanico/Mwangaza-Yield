import type { MacroIndicator } from '@/types/bond';

export type MacroData = MacroIndicator[];

function latestValue(macro: MacroData, indicator: string): number | null {
  const rows = macro
    .filter((m) => m.indicator === indicator && Number.isFinite(m.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return rows[0]?.value ?? null;
}

/**
 * Debt sustainability, or `null` for each part we cannot source.
 *
 * MISSING USED TO MEAN ZERO, AND ZERO IS A CLAIM.
 *
 * These fell back to 0, so an absent debt figure rendered as "Debt/GDP 0.0%"
 * and `sustainabilitySignal(0, 0)` returned green — the most reassuring
 * possible reading of no data at all, on the question a bond buyer most needs
 * answered honestly.
 *
 * That is not hypothetical here. sovereign-gaps.ts exists because the World
 * Bank returns NO OBSERVATION for Kenya's Government debt / GDP: the request
 * succeeds and comes back empty, and the site tells the reader so and points
 * at the National Treasury bulletin instead. Between 2026-08-18 and 2026-08-20
 * macro.json also carried a hand-typed DEBT_TO_GDP of 67.2 attributed to
 * "National Treasury / World Bank", so the app said both things at once — we
 * cannot obtain this figure, and here is the figure with a traffic light on it.
 * The invented one was the confident one. It has been removed.
 *
 * So absence is now `null` and every caller has to decide what to show, which
 * is the point: there is no value that means "unknown" and also formats.
 */
export function computeDebtSustainabilityIndicators(macro: MacroData): {
  debtToGDP: number | null;
  debtServiceRatio: number | null;
  fiscalSpace: number | null;
} {
  const debtToGDP = latestValue(macro, 'DEBT_TO_GDP');
  const debtServiceRatio =
    latestValue(macro, 'DEBT_SERVICE_TO_REVENUE') ??
    latestValue(macro, 'INTEREST_TO_REVENUE');

  if (debtToGDP === null || debtServiceRatio === null) {
    return { debtToGDP, debtServiceRatio, fiscalSpace: null };
  }

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

/**
 * The premium, or null when either leg is missing. Zero would read as a flat
 * curve — a measured statement that long and short pay the same — which is the
 * same mistake `computeKenyaSpread` below was corrected for. The two are
 * siblings and had drifted apart: this one returned 0 and its caller passed
 * `?? 0` for an absent benchmark, so a missing bond or T-bill dataset rendered
 * "0.00%" beside "Long bonds pay above short rates, rewarding duration risk."
 */
export function computeTermPremium(
  longYield: number | null,
  shortYield: number | null
): number | null {
  if (longYield === null || shortYield === null) return null;
  if (!Number.isFinite(longYield) || !Number.isFinite(shortYield)) return null;
  return longYield - shortYield;
}

/** The spread, or null when either leg is missing. Zero would read as parity. */
export function computeKenyaSpread(
  emYield: number | null,
  usYield: number | null
): number | null {
  if (emYield === null || usYield === null) return null;
  if (!Number.isFinite(emYield) || !Number.isFinite(usYield)) return null;
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

export function sustainabilitySignal(
  debtToGDP: number | null,
  debtServiceRatio: number | null
): 'green' | 'yellow' | 'red' | null {
  // No figures, no verdict. Green was the previous answer to missing data.
  if (debtToGDP === null || debtServiceRatio === null) return null;
  // Simple IMF-style guardrails: debt below 55 and debt service below 25 = healthier.
  if (debtToGDP < 55 && debtServiceRatio < 25) return 'green';
  if (debtToGDP < 70 && debtServiceRatio < 35) return 'yellow';
  return 'red';
}
