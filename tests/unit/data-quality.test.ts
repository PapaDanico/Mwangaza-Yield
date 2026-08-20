import { describe, expect, it } from 'vitest';
import { computeDataQuality } from '../../src/lib/data-quality';
import * as dataQuality from '../../src/lib/data-quality';

describe('dataQuality', () => {
  it('scores dataset quality', () => {
    const score = computeDataQuality([
      { issueDate: '2026-01-01', maturityDate: '2027-01-01', value: 10 },
      { issueDate: '2026-02-01', maturityDate: '2025-01-01', value: 9999 },
    ]);
    expect(score.score).toBeLessThan(100);
    expect(score.inconsistencies).toBeGreaterThan(0);
  });

  it('calls an empty dataset unscorable rather than perfect', () => {
    const score = computeDataQuality([]);
    expect(score.score).toBe(0);
    expect(score.issues).toContain('Dataset is empty');
  });

  it('does not judge freshness — data-freshness.ts owns the cadence', () => {
    // This module shipped a second freshness rule with 6h/24h/72h buckets that
    // contradicted the schedule-aware one and reported healthy data as stale.
    // Re-adding one here is how the cadence table comes to exist twice again.
    expect(Object.keys(dataQuality)).not.toContain('computeFreshness');
    expect(Object.keys(dataQuality)).not.toContain('generateDataReport');
  });
});
