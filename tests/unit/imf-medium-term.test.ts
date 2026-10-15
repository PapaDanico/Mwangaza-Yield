import { describe, it, expect } from 'vitest';
import { mediumTermInflation, type WeoSeries } from '../../src/lib/imf-context';
import imf from '../../public/data/imf-outlook.json';

describe('mediumTermInflation', () => {
  it('averages the five projected years after the given year, from the file on hand', () => {
    const m = mediumTermInflation(imf as WeoSeries[], 2026)!;
    expect(m.firstYear).toBe(2027);
    expect(m.lastYear).toBe(2031);
    // October 2026 WEO: 5.0, 5.3, 5.2, 5.0, 5.0
    expect(m.pct).toBeCloseTo(5.1, 6);
    expect(m.source).toMatch(/October 2026/);
  });
  it('is null, not zero, without the series', () => {
    expect(mediumTermInflation([], 2026)).toBeNull();
  });
});
