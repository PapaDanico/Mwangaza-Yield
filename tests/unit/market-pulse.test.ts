import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import bondsData from '../../public/data/bonds.json';
import {
  MIN_BUCKET_SAMPLE,
  demandPulse,
  recentClearingByTerm,
} from '../../src/lib/market-pulse';
import type { AuctionPrint, Bond } from '../../src/types/bond';

const prints = archive as unknown as AuctionPrint[];
const bonds = bondsData as unknown as Bond[];

const p = (over: Partial<AuctionPrint>): AuctionPrint => ({
  id: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/010',
  auctionDate: '2026-06-17',
  weightedAverageRate: 14,
  ...over,
});

const b = (over: Partial<Bond>): Bond => ({
  isin: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/010',
  name: 'test',
  category: 'FXD',
  issueDate: '2024-06-24',
  maturityDate: '2034-06-12',
  tenorYears: 10,
  couponRate: 14,
  couponFrequencyPerYear: 2,
  ytmGross: 14,
  minInvestmentKES: 50_000,
  taxExempt: false,
  ...over,
});

const ASOF = new Date('2026-07-26');

describe('recentClearingByTerm', () => {
  it('buckets by remaining term at the auction, not the tenor label', () => {
    // A "15-year" code with ~5 years left must land in 3–7y, not 12–20y.
    const reopened = b({ issueCode: 'FXD2/2013/015', tenorYears: 15, maturityDate: '2031-06-11', isin: 'r' });
    const rows = [1, 2, 3].map((i) =>
      p({ issueCode: 'FXD2/2013/015', auctionDate: `2026-0${i}-17`, weightedAverageRate: 15 + i })
    );
    const buckets = recentClearingByTerm(rows, [reopened], ASOF);
    expect(buckets.find((x) => x.label === '3–7y')!.count).toBe(3);
    expect(buckets.find((x) => x.label === '12–20y')!.count).toBe(0);
  });

  it('excludes auctions outside the window', () => {
    const rows = [1, 2, 3].map((i) =>
      p({ auctionDate: `2024-0${i}-17`, weightedAverageRate: 15 })
    );
    const buckets = recentClearingByTerm(rows, [b({})], ASOF);
    expect(buckets.every((x) => x.count === 0)).toBe(true);
  });

  it('reports a thin band as thin instead of quoting a median of two', () => {
    const rows = [1, 2].map((i) => p({ auctionDate: `2026-0${i}-17`, weightedAverageRate: 14 }));
    const buckets = recentClearingByTerm(rows, [b({})], ASOF);
    const band = buckets.find((x) => x.count === 2)!;
    expect(band.median).toBeNull();
    expect(MIN_BUCKET_SAMPLE).toBeGreaterThan(2);
  });

  it('produces populated bands from the shipped archive', () => {
    // Live-data pin (measured 2026-07: 0/3/15/20/8). Counts will drift with
    // the archive, but at least two bands should stay quotable and every
    // quoted median should look like a Kenyan government rate.
    const buckets = recentClearingByTerm(prints, bonds, ASOF);
    const quoted = buckets.filter((x) => x.median !== null);
    expect(quoted.length).toBeGreaterThanOrEqual(2);
    for (const q of quoted) {
      expect(q.median!).toBeGreaterThan(5);
      expect(q.median!).toBeLessThan(25);
      expect(q.low!).toBeLessThanOrEqual(q.median!);
      expect(q.median!).toBeLessThanOrEqual(q.high!);
      expect(q.latestDate).not.toBeNull();
    }
  });
});

describe('demandPulse', () => {
  it('returns null below the minimum sample instead of a two-point pulse', () => {
    const rows = [p({ amountOfferedKESM: 10_000, bidsReceivedKESM: 12_000, amountAcceptedKESM: 9_000 })];
    expect(demandPulse(rows, ASOF)).toBeNull();
  });

  it('reads the shipped archive: oversubscribed, most money accepted', () => {
    const d = demandPulse(prints, ASOF)!;
    expect(d).not.toBeNull();
    expect(d.auctions).toBeGreaterThanOrEqual(10);
    expect(d.medianCover).toBeGreaterThan(0.5);
    expect(d.medianCover).toBeLessThan(10);
    expect(d.medianAcceptance).toBeGreaterThan(0);
    expect(d.medianAcceptance).toBeLessThanOrEqual(1);
  });

  it('leaves the trend unknown below six auctions', () => {
    const rows = [1, 2, 3, 4].map((i) =>
      p({ auctionDate: `2026-0${i}-17`, amountOfferedKESM: 10_000, bidsReceivedKESM: 12_000, amountAcceptedKESM: 9_000 })
    );
    const d = demandPulse(rows, ASOF)!;
    expect(d.auctions).toBe(4);
    expect(d.coverTrendPp).toBeNull();
  });
});
