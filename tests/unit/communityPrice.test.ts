import { describe, it, expect } from 'vitest';
import {
  anonymizeSubmission,
  aggregatePrices,
  computeFairValueSpread,
  roundToQuarter,
  COMMUNITY_MIN_SUBMISSIONS,
  type PriceSubmission,
  type AnonymizedSubmission,
} from '../../src/lib/communityPrice';

function sub(isin: string, price: number, date = '2026-08-15', source: PriceSubmission['source'] = 'Broker'): PriceSubmission {
  return { isin, price, observedOn: date, source };
}

function anon(isin: string, price: number, date = '2026-08-15', source: AnonymizedSubmission['source'] = 'Broker'): AnonymizedSubmission {
  return { isin, price, date, source };
}

describe('roundToQuarter', () => {
  it('rounds to the nearest 0.25', () => {
    expect(roundToQuarter(96.3)).toBe(96.25);
    expect(roundToQuarter(96.63)).toBe(96.75);
    expect(roundToQuarter(100)).toBe(100);
    // 97.125 * 4 = 388.5 → Math.round → 389 → 97.25
    expect(roundToQuarter(97.125)).toBe(97.25);
    // 97.1 * 4 = 388.4 → Math.round → 388 → 97.0
    expect(roundToQuarter(97.1)).toBe(97.0);
  });
});

describe('anonymizeSubmission', () => {
  it('strips timestamp to day-level only', () => {
    const s = sub('KE-A', 96.4, '2026-08-15');
    const a = anonymizeSubmission(s, 10);
    expect(a.date).toBe('2026-08-15');
    expect(a.date).not.toContain('T');
  });

  it('rounds price to nearest 0.25 when count >= LAPLACE_THRESHOLD', () => {
    const s = sub('KE-A', 96.37);
    const a = anonymizeSubmission(s, 10);
    // With no noise (count >= 5), price must be exactly rounded.
    expect(a.price).toBe(roundToQuarter(96.37));
  });

  it('preserves isin and source', () => {
    const s = sub('KE-FXD', 98, '2026-08-01', 'DhowCSD');
    const a = anonymizeSubmission(s, 10);
    expect(a.isin).toBe('KE-FXD');
    expect(a.source).toBe('DhowCSD');
  });

  it('adds noise when existingCount < 5, so result may differ from rounded input', () => {
    // Run many times; at least once the noise should perturb the value.
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      results.add(anonymizeSubmission(sub('KE-A', 96.0), 2).price);
    }
    // With Laplace noise, we expect more than one distinct output over 100 runs.
    expect(results.size).toBeGreaterThan(1);
  });

  it('does not add noise when existingCount >= 5', () => {
    // With count=5 there should be no noise — the rounded value is always the same.
    const results = new Set<number>();
    for (let i = 0; i < 20; i++) {
      results.add(anonymizeSubmission(sub('KE-A', 96.0), 5).price);
    }
    expect(results.size).toBe(1);
  });
});

describe('aggregatePrices', () => {
  it('returns null when submissions < COMMUNITY_MIN_SUBMISSIONS', () => {
    const subs = [anon('KE-A', 96), anon('KE-A', 97)];
    expect(aggregatePrices(subs)).toBeNull();
  });

  it('returns null for zero submissions', () => {
    expect(aggregatePrices([])).toBeNull();
  });

  it('returns a CommunityPrice for >= 3 submissions', () => {
    const subs = [anon('KE-A', 96), anon('KE-A', 97), anon('KE-A', 98)];
    const cp = aggregatePrices(subs);
    expect(cp).not.toBeNull();
    expect(cp!.count).toBe(3);
    expect(cp!.isin).toBe('KE-A');
  });

  it('computes the correct median for odd count', () => {
    const subs = [anon('KE-A', 90), anon('KE-A', 100), anon('KE-A', 95)];
    const cp = aggregatePrices(subs)!;
    // Sorted: 90, 95, 100 → median = 95 → rounded to quarter = 95
    expect(cp.median).toBe(95);
  });

  it('computes the correct median for even count', () => {
    const subs = [
      anon('KE-A', 90),
      anon('KE-A', 92),
      anon('KE-A', 96),
      anon('KE-A', 98),
    ];
    const cp = aggregatePrices(subs)!;
    // Sorted: 90, 92, 96, 98 → median = (92+96)/2 = 94 → rounded = 94
    expect(cp.median).toBe(94);
  });

  it('uses median not mean (resistant to outliers)', () => {
    const subs = [
      anon('KE-A', 96),
      anon('KE-A', 97),
      anon('KE-A', 150), // outlier
    ];
    const cp = aggregatePrices(subs)!;
    // Sorted: 96, 97, 150 → median = 97
    // Mean would be ≈ 114.3 — clearly not the median
    expect(cp.median).toBe(97);
  });

  it('tracks min and max correctly', () => {
    const subs = [anon('KE-A', 94), anon('KE-A', 96), anon('KE-A', 100)];
    const cp = aggregatePrices(subs)!;
    expect(cp.min).toBe(94);
    expect(cp.max).toBe(100);
  });

  it('picks the most recent date for lastUpdated', () => {
    const subs = [
      anon('KE-A', 96, '2026-08-10'),
      anon('KE-A', 97, '2026-08-15'),
      anon('KE-A', 98, '2026-08-01'),
    ];
    expect(aggregatePrices(subs)!.lastUpdated).toBe('2026-08-15');
  });
});

describe('computeFairValueSpread', () => {
  it('returns "at" when spread is within ±2%', () => {
    const r = computeFairValueSpread('KE-A', 100, 100);
    expect(r.verdict).toBe('at');
    expect(r.badgeColor).toBe('green');
  });

  it('returns "at" for small spread within ±2%', () => {
    const r = computeFairValueSpread('KE-A', 101.5, 100);
    expect(r.verdict).toBe('at');
  });

  it('returns "above" with gold badge for 2-5% above', () => {
    const r = computeFairValueSpread('KE-A', 103.5, 100);
    expect(r.verdict).toBe('above');
    expect(r.badgeColor).toBe('gold');
    expect(r.badgeText).toContain('above fair value');
  });

  it('returns "above" with red badge for > 5% above', () => {
    const r = computeFairValueSpread('KE-A', 106, 100);
    expect(r.verdict).toBe('above');
    expect(r.badgeColor).toBe('red');
  });

  it('returns "below" with green badge when community price is below theoretical', () => {
    const r = computeFairValueSpread('KE-A', 97, 100);
    expect(r.verdict).toBe('below');
    expect(r.badgeColor).toBe('green');
    expect(r.badgeText).toContain('below fair value');
  });

  it('reports spreadPct correctly', () => {
    const r = computeFairValueSpread('KE-A', 105, 100);
    expect(r.spreadPct).toBeCloseTo(0.05, 5);
  });
});

describe('privacy invariants', () => {
  it('never shows community stats for fewer than COMMUNITY_MIN_SUBMISSIONS submissions', () => {
    for (let count = 0; count < COMMUNITY_MIN_SUBMISSIONS; count++) {
      const subs = Array.from({ length: count }, () => anon('KE-A', 95));
      expect(aggregatePrices(subs)).toBeNull();
    }
  });

  it('shows community stats at exactly COMMUNITY_MIN_SUBMISSIONS', () => {
    const subs = Array.from({ length: COMMUNITY_MIN_SUBMISSIONS }, () => anon('KE-A', 95));
    expect(aggregatePrices(subs)).not.toBeNull();
  });
});
