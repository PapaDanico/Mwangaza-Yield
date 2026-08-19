import { describe, expect, it } from 'vitest';
import { computeDataQuality, computeFreshness, generateDataReport } from '../../src/lib/data-quality';

describe('dataQuality', () => {
  it('computes freshness buckets', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    expect(computeFreshness('2026-01-01T09:00:00Z', now)).toBe('fresh');
    expect(computeFreshness('2026-01-01T00:00:00Z', now)).toBe('stale');
    expect(computeFreshness('2025-12-31T00:00:00Z', now)).toBe('old');
    expect(computeFreshness('2025-12-20T00:00:00Z', now)).toBe('expired');
  });

  it('scores dataset quality', () => {
    const score = computeDataQuality([
      { issueDate: '2026-01-01', maturityDate: '2027-01-01', value: 10 },
      { issueDate: '2026-02-01', maturityDate: '2025-01-01', value: 9999 },
    ]);
    expect(score.score).toBeLessThan(100);
    expect(score.inconsistencies).toBeGreaterThan(0);
  });

  it('builds a report', () => {
    const report = generateDataReport({
      datasets: [
        {
          id: 'macro',
          label: 'Macro',
          source: 'CBK',
          sourceUrl: 'https://example.com',
          dataDate: new Date().toISOString(),
          file: 'macro.json',
          dataset: [{ a: 1 }],
        },
      ],
    });
    expect(report.datasets).toHaveLength(1);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
  });
});
