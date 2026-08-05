import { describe, it, expect } from 'vitest';
import { realTerms, realSeries } from '../../src/lib/real-terms';
import type { MacroIndicator } from '../../src/types/bond';

/**
 * The layer that says what a rate is actually worth.
 *
 * Two things are load-bearing and both are easy to get wrong in the flattering
 * direction: the Fisher relation rather than subtraction, and refusing to
 * produce a number when the inflation print cannot support one.
 */

const macro = (rate: number, date: string): MacroIndicator[] => [
  { id: `cpi-${date}`, indicator: 'CPI', value: rate, date, unit: '%', source: 'KNBS' },
];

const today = new Date().toISOString().slice(0, 10);

describe('realTerms', () => {
  it('uses the Fisher relation, not subtraction', () => {
    // 11.56 net against 6.41 inflation is 4.84 real; subtraction says 5.15.
    // A 31bp overstatement that grows with both rates.
    const r = realTerms(11.56, macro(6.41, today))!;
    expect(r.realPct).toBeCloseTo(4.84, 1);
    expect(r.realPct).toBeLessThan(11.56 - 6.41);
  });

  it('flags a rate that loses to inflation', () => {
    const r = realTerms(5.0, macro(6.5, today))!;
    expect(r.losesToInflation).toBe(true);
    expect(r.realPct).toBeLessThan(0);
  });

  it('does not flag one that beats it', () => {
    expect(realTerms(11.5, macro(6.5, today))!.losesToInflation).toBe(false);
  });

  it('carries the print it used, so the reader can check it', () => {
    const r = realTerms(11.5, macro(6.5, today))!;
    expect(r.inflationPct).toBe(6.5);
    expect(r.inflationAsOf).toBe(today);
  });

  it('returns null rather than a number when there is no CPI', () => {
    // A real yield computed from a missing print is a figure with no meaning.
    expect(realTerms(11.5, [])).toBeNull();
  });

  it('returns null on a stale CPI print', () => {
    // latestInflation enforces the age budget; this proves the layer honours
    // it rather than reaching past it.
    expect(realTerms(11.5, macro(6.5, '2020-01-01'))).toBeNull();
  });

  it('returns null for a non-finite rate', () => {
    expect(realTerms(Number.NaN, macro(6.5, today))).toBeNull();
    expect(realTerms(Number.POSITIVE_INFINITY, macro(6.5, today))).toBeNull();
  });
});

describe('realSeries refuses what it cannot date-match', () => {
  /**
   * This is the guard that stops a historical real curve being drawn from one
   * recent CPI print. macro.json holds no inflation history, so the only
   * reading available to pair with a 2019 yield is a 2026 one — and Kenyan
   * inflation ran above 9% in 2017 and near 5% in 2020. Deflating every year
   * by one print invents a curve whose shape is an artefact of a single month.
   */
  it('returns null when a point has no contemporaneous reading', () => {
    const points = [
      { date: '2019-06-01', netPct: 12.0 },
      { date: '2026-06-01', netPct: 13.0 },
    ];
    const cpi = new Map([['2026-07-01', 6.5]]);
    expect(realSeries(points, cpi)).toBeNull();
  });

  it('refuses the whole series, not just the unmatched point', () => {
    // A curve with silent holes reads as a complete curve.
    const points = [
      { date: '2026-06-01', netPct: 13.0 },
      { date: '2010-06-01', netPct: 9.0 },
    ];
    const cpi = new Map([['2026-06-15', 6.5]]);
    expect(realSeries(points, cpi)).toBeNull();
  });

  it('computes the series when every point has a reading in range', () => {
    const points = [
      { date: '2025-06-01', netPct: 12.0 },
      { date: '2026-06-01', netPct: 13.0 },
    ];
    const cpi = new Map([
      ['2025-06-10', 5.0],
      ['2026-06-10', 6.5],
    ]);
    const out = realSeries(points, cpi)!;
    expect(out).toHaveLength(2);
    // Each point deflated by ITS OWN year's print, not a shared one.
    expect(out[0].realPct).toBeCloseTo(((1.12 / 1.05) - 1) * 100, 4);
    expect(out[1].realPct).toBeCloseTo(((1.13 / 1.065) - 1) * 100, 4);
  });

  it('returns null with no CPI history at all — today’s situation', () => {
    expect(realSeries([{ date: '2026-06-01', netPct: 13 }], new Map())).toBeNull();
  });
});
