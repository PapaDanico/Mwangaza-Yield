import { describe, expect, it } from 'vitest';
import { latestForecasts } from '../../src/components/dashboard/LatestForecast';
import type { Prediction } from '../../src/lib/predictions';

const p = (o: Partial<Prediction>) => ({ issueCode: 'X', auctionDate: '2026-01-01', low: 1, high: 2, ...o }) as Prediction;

describe('latestForecasts', () => {
  it('shows only the newest scored auction, misses included, and every pending forecast', () => {
    const r = latestForecasts([
      p({ issueCode: 'A', auctionDate: '2026-09-16', scoredOn: '2026-09-16', actualRate: 13, hitRange: true }),
      p({ issueCode: 'B', auctionDate: '2026-09-30', scoredOn: '2026-09-30', actualRate: 14, hitRange: false }),
      p({ issueCode: 'C', auctionDate: '2026-09-30', scoredOn: '2026-09-30', actualRate: 13.6, hitRange: true }),
      p({ issueCode: 'D', auctionDate: '2026-10-14' }),
      p({ issueCode: 'E', auctionDate: '2026-10-07', excludedOn: '2026-10-01' }),
    ]);
    expect(r.last.map((x) => x.issueCode)).toEqual(['B', 'C']);
    expect(r.pending.map((x) => x.issueCode)).toEqual(['D']);
  });
});
