// @ts-nocheck -- tests a plain .mjs maintenance script
import { describe, expect, it } from 'vitest';
import { coverage, monthly } from '../../scripts/metrics-report.mjs';

describe('metrics-report', () => {
  const days = {
    '2026-08-30': { ladder: 3, calculator: 1 },
    '2026-09-01': { ladder: 2 },
    '2026-09-02': { ladder: 5, calculator: 4, junk: 'x' },
  };

  it('sums each event by calendar month, largest first within a month', () => {
    expect(monthly(days)).toEqual([
      { month: '2026-08', event: 'ladder', uses: 3 },
      { month: '2026-08', event: 'calculator', uses: 1 },
      { month: '2026-09', event: 'ladder', uses: 7 },
      { month: '2026-09', event: 'calculator', uses: 4 },
    ]);
  });

  it('reports the window held, so a partial month is not read as a whole one', () => {
    expect(coverage(days)).toEqual({ from: '2026-08-30', to: '2026-09-02' });
    expect(coverage({})).toBeNull();
    expect(monthly(undefined)).toEqual([]);
  });
});
