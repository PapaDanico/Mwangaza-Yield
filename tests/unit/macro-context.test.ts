import { describe, expect, it } from 'vitest';
import {
  computeDebtSustainabilityIndicators,
  computeKenyaSpread,
  computeRealRate,
  computeTermPremium,
  sustainabilitySignal,
  trendArrow,
} from '../../src/lib/macro-context';

const sample = [
  { id: '1', indicator: 'DEBT_TO_GDP', value: 65, date: '2026-01-01', unit: '%', source: 'Treasury' },
  { id: '2', indicator: 'DEBT_SERVICE_TO_REVENUE', value: 28, date: '2026-01-01', unit: '%', source: 'WB' },
] as any;

describe('macroContext', () => {
  it('computes debt indicators', () => {
    const out = computeDebtSustainabilityIndicators(sample);
    expect(out.debtToGDP).toBe(65);
    expect(out.debtServiceRatio).toBe(28);
    expect(out.fiscalSpace).toBeGreaterThanOrEqual(0);
  });

  it('computes rate and spread helpers', () => {
    expect(computeRealRate(10, 6)).toBe(4);
    expect(computeTermPremium(14, 9)).toBe(5);
    expect(computeKenyaSpread(12, 4)).toBe(8);
  });

  it('renders no arrow when there is no previous value to compare against', () => {
    // macro.json holds one row per indicator, so a missing previous value is
    // the normal case, not an edge case. Returning '→' there claimed the
    // figure had not moved when we simply had not read a series.
    expect(trendArrow(8.75, null)).toBeNull();
    expect(trendArrow(8.75, undefined)).toBeNull();
    expect(trendArrow(8.75, Number.NaN)).toBeNull();
    expect(trendArrow(Number.NaN, 8.5)).toBeNull();
  });

  it('derives trend and sustainability colours', () => {
    expect(trendArrow(2, 1)).toBe('▲');
    expect(trendArrow(1, 2)).toBe('▼');
    expect(trendArrow(2, 2)).toBe('→');
    expect(sustainabilitySignal(50, 20)).toBe('green');
    expect(sustainabilitySignal(62, 31)).toBe('yellow');
    expect(sustainabilitySignal(80, 40)).toBe('red');
  });
});
