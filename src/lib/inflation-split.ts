/**
 * Why "inflation is 6.5%" is the wrong number for most households.
 *
 * KNBS publishes the headline alongside a split almost nobody quotes: CORE
 * inflation, which strips out food and energy, and NON-CORE, which is mostly
 * what it stripped. In July 2026 the headline was 6.5% — core 3.2%, non-core
 * 15.0%. The core basket is 81.1% of the CPI, so a small, violently moving
 * fifth is doing most of the work.
 *
 * WHY THIS MATTERS HERE SPECIFICALLY
 *
 * This app deflates bond yields by the headline CPI, and the sister product
 * plans retirements against a real return derived from it. Both are quietly
 * assuming the reader's shopping resembles the national average basket.
 *
 * For a poorer household it does not, and the error is not small. Food and
 * transport are a much larger share of a low-income budget than of the CPI
 * weights, so the inflation such a household actually experiences sits well
 * above the headline — nearer the non-core number than the core one. Their
 * real return on a T-bill is correspondingly worse than this app shows.
 *
 * That is the honest caveat on every real yield in the product, and it was
 * nowhere until this file existed.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not reweight anything or estimate a personal inflation rate. Doing
 * that properly needs a household's own spending shares, which this app does
 * not have and does not want — and a made-up personal CPI would be worse than
 * the headline, because it would carry false precision. This states the spread
 * and lets the reader place themselves inside it.
 */

import type { MacroIndicator } from '../types/bond';

export interface InflationSplit {
  headline: number;
  core: number;
  nonCore: number;
  date: string;
  source: string;
  /** Percentage points between the two baskets — the whole point. */
  spreadPp: number;
}

/**
 * Read the split, or return null when any leg is missing.
 *
 * Null rather than a partial answer: "core inflation is 3.2%" shown without
 * the non-core figure beside it is actively misleading, because it reads as
 * reassurance. The comparison is the information.
 */
export function inflationSplit(macro: MacroIndicator[]): InflationSplit | null {
  const latest = (indicator: MacroIndicator['indicator']) =>
    macro
      .filter((m) => m.indicator === indicator && Number.isFinite(m.value))
      .sort((a, b) => a.date.localeCompare(b.date))
      .pop() ?? null;

  const headline = latest('CPI');
  const core = latest('CPI_CORE');
  const nonCore = latest('CPI_NONCORE');
  if (!headline || !core || !nonCore) return null;

  /* Readings from different months would make the spread meaningless — the
   * comparison only holds within one KNBS release. */
  if (core.date !== nonCore.date) return null;

  return {
    headline: headline.value,
    core: core.value,
    nonCore: nonCore.value,
    date: core.date,
    source: core.source,
    spreadPp: Math.round((nonCore.value - core.value) * 100) / 100,
  };
}

/**
 * Which basket a reader's own inflation is likely to resemble, in words.
 *
 * Deliberately not a calculation. The honest statement is directional: the
 * more of your money goes on food, cooking fuel and transport, the closer you
 * are to the non-core figure. Anything more precise would need spending data
 * this app does not hold.
 */
export function whoFeelsWhat(split: InflationSplit): string {
  if (split.spreadPp < 2) {
    return 'The two baskets are moving together this month, so the headline is a fair guide for most households.';
  }
  return `Food, cooking fuel and transport rose ${split.nonCore.toFixed(
    1
  )}% while everything else rose ${split.core.toFixed(
    1
  )}%. The more of your money goes on those, the further above the ${split.headline.toFixed(
    1
  )}% headline your own cost of living has actually moved.`;
}
