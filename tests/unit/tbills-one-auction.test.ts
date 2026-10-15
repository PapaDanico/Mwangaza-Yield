import { describe, it, expect } from 'vitest';
import tbills from '../../public/data/tbills.json';
import feed from '../../public/data/rates.json';

/* tbills.json holds ONE auction: three rows, one per tenor, replaced each week
 * (the previous rate moves to previousDiscountRate). On 15 Oct 2026 the 8 Oct
 * rows were appended instead of replacing the 1 Oct ones, and the public rates
 * feed — which JiPange and outside readers consume — briefly listed every tenor
 * twice. Caught by eye in a build log; this makes it a test. */
describe('tbills.json is a single auction', () => {
  it('has exactly one row per tenor, all from the same auction', () => {
    expect(tbills.map((t) => t.tenorDays).sort((a, b) => a - b)).toEqual([91, 182, 364]);
    expect(new Set(tbills.map((t) => t.auctionDate)).size).toBe(1);
  });
  it('the published feed lists each tenor once', () => {
    const days = (feed as { tbills: { tenorDays: number }[] }).tbills.map((t) => t.tenorDays);
    expect(new Set(days).size).toBe(days.length);
  });
});
