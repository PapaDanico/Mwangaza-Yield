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

  it('reports missing debt figures as unknown, never as zero', () => {
    // Falling back to 0 made sustainabilitySignal(0, 0) return GREEN — the most
    // reassuring possible answer to no data, on the question a bond buyer most
    // needs answered honestly. The World Bank has no observation for Kenya's
    // Government debt / GDP, so this is the normal case, not an edge case.
    const out = computeDebtSustainabilityIndicators([] as any);
    expect(out.debtToGDP).toBeNull();
    expect(out.debtServiceRatio).toBeNull();
    expect(out.fiscalSpace).toBeNull();
  });

  it('gives no sustainability verdict without both figures', () => {
    expect(sustainabilitySignal(null, null)).toBeNull();
    expect(sustainabilitySignal(65, null)).toBeNull();
    expect(sustainabilitySignal(null, 28)).toBeNull();
    // And still judges when it genuinely has both.
    expect(sustainabilitySignal(50, 20)).toBe('green');
  });

  it('gives no spread when either leg is missing', () => {
    // Zero would read as parity with the global benchmark.
    expect(computeKenyaSpread(null, 4)).toBeNull();
    expect(computeKenyaSpread(12, null)).toBeNull();
    expect(computeKenyaSpread(12, 4)).toBe(8);
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
