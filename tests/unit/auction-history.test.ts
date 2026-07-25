import { describe, it, expect } from 'vitest';
import {
  normaliseCode,
  clearingRate,
  historyFor,
  summarise,
  describeHistory,
  readAgainstOwnRange,
  monthYear,
} from '../../src/lib/auction-history';
import type { AuctionPrint } from '../../src/types/bond';

function print(over: Partial<AuctionPrint> & { issueCode: string; auctionDate: string }): AuctionPrint {
  return { id: `${over.issueCode}-${over.auctionDate}`, ...over };
}

describe('normaliseCode', () => {
  it('makes the display and padded spellings of one bond agree', () => {
    // This is the whole reason the function exists: bonds.json says FXD1/2022/10,
    // auction-results.json says FXD1/2022/010, and a raw string match finds nothing.
    expect(normaliseCode('FXD1/2022/10')).toBe(normaliseCode('FXD1/2022/010'));
  });

  it('pads the tenor to three digits', () => {
    expect(normaliseCode('FXD1/2022/10')).toBe('FXD1/2022/010');
    expect(normaliseCode('IFB1/2023/7')).toBe('IFB1/2023/007');
    expect(normaliseCode('SDB1/2011/030')).toBe('SDB1/2011/030');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normaliseCode(' fxd1/2022/10 ')).toBe('FXD1/2022/010');
  });

  it('returns an unrecognised code upper-cased rather than throwing', () => {
    expect(normaliseCode('not-a-code')).toBe('NOT-A-CODE');
  });
});

describe('clearingRate', () => {
  it('prefers the accepted-bid average, which is what buyers actually got', () => {
    const p = print({
      issueCode: 'FXD1/2022/010',
      auctionDate: '2026-01-05',
      weightedAverageRate: 13.5,
      marketWeightedAverageRate: 14.1,
    });
    expect(clearingRate(p)).toBe(13.5);
  });

  it('falls back to the market average when no accepted average is published', () => {
    const p = print({ issueCode: 'X/2020/005', auctionDate: '2026-01-05', marketWeightedAverageRate: 14.1 });
    expect(clearingRate(p)).toBe(14.1);
  });

  it('never substitutes the coupon — that is a promise, not an auction outcome', () => {
    const p = print({ issueCode: 'X/2020/005', auctionDate: '2026-01-05', couponRate: 12 });
    expect(clearingRate(p)).toBeNull();
  });
});

describe('historyFor', () => {
  const prints: AuctionPrint[] = [
    print({ issueCode: 'FXD1/2022/010', auctionDate: '2026-03-01', weightedAverageRate: 13.0 }),
    print({ issueCode: 'FXD1/2022/010', auctionDate: '2026-01-01', weightedAverageRate: 12.0 }),
    print({ issueCode: 'IFB1/2023/007', auctionDate: '2026-02-01', weightedAverageRate: 15.0 }),
  ];

  it('matches across spellings of the same code', () => {
    expect(historyFor(prints, 'FXD1/2022/10')).toHaveLength(2);
  });

  it('returns points oldest first, so a chart reads left to right in time', () => {
    expect(historyFor(prints, 'FXD1/2022/010').map((p) => p.date)).toEqual(['2026-01-01', '2026-03-01']);
  });

  it('does not mix in another bond', () => {
    expect(historyFor(prints, 'IFB1/2023/007').map((p) => p.rate)).toEqual([15.0]);
  });

  it('drops prints with no clearing rate rather than plotting a gap as zero', () => {
    const withGap = [...prints, print({ issueCode: 'FXD1/2022/010', auctionDate: '2026-05-01', couponRate: 12.5 })];
    expect(historyFor(withGap, 'FXD1/2022/010')).toHaveLength(2);
  });

  it('collapses two files reporting the same auction date into one point', () => {
    // A tap sale published alongside the main sale would otherwise draw a
    // vertical line between two readings of one event.
    const dupes = [
      print({ issueCode: 'FXD1/2022/010', auctionDate: '2026-01-01', weightedAverageRate: 12.0 }),
      print({ issueCode: 'FXD1/2022/10', auctionDate: '2026-01-01', weightedAverageRate: 12.0 }),
    ];
    expect(historyFor(dupes, 'FXD1/2022/010')).toHaveLength(1);
  });

  it('returns nothing for a bond that has never been read', () => {
    expect(historyFor(prints, 'FXD9/1999/001')).toEqual([]);
  });
});

describe('summarise', () => {
  const points = [
    { date: '2025-01-01', rate: 12.0 },
    { date: '2025-06-01', rate: 14.0 },
    { date: '2026-01-01', rate: 13.0 },
  ];

  it('refuses to call a single auction a history', () => {
    expect(summarise([{ date: '2026-01-01', rate: 13.0 }])).toBeNull();
    expect(summarise([])).toBeNull();
  });

  it('reports the latest and the one before it', () => {
    const h = summarise(points)!;
    expect(h.latest.rate).toBe(13.0);
    expect(h.previous!.rate).toBe(14.0);
  });

  it('measures the change against the previous print, in basis points', () => {
    expect(summarise(points)!.changeBps).toBe(-100);
  });

  it('finds the high and low across the whole history, not just the ends', () => {
    const h = summarise(points)!;
    expect(h.high.rate).toBe(14.0);
    expect(h.low.rate).toBe(12.0);
    expect(h.high.date).toBe('2025-06-01');
  });

  it('places the latest inside its own range', () => {
    // 13.0 sits halfway between 12.0 and 14.0
    expect(summarise(points)!.position).toBeCloseTo(0.5, 6);
  });

  it('calls a perfectly flat history typical rather than dividing by zero', () => {
    const flat = summarise([
      { date: '2025-01-01', rate: 13.0 },
      { date: '2026-01-01', rate: 13.0 },
    ])!;
    expect(flat.position).toBe(0.5);
    expect(flat.changeBps).toBe(0);
  });
});

describe('describeHistory', () => {
  it('says how many auctions, since when, and how the last one compared', () => {
    const h = summarise([
      { date: '2025-01-01', rate: 12.0 },
      { date: '2025-06-01', rate: 14.0 },
      { date: '2026-01-01', rate: 13.0 },
    ])!;
    const text = describeHistory(h);
    expect(text).toContain('3 times');
    expect(text).toContain('January 2025');
    expect(text).toContain('13.00%');
    expect(text).toContain('1.00 percentage points less');
  });

  it('says "twice" rather than "2 times"', () => {
    const h = summarise([
      { date: '2025-01-01', rate: 12.0 },
      { date: '2026-01-01', rate: 12.5 },
    ])!;
    expect(describeHistory(h)).toContain('twice');
    expect(describeHistory(h)).toContain('0.50 percentage points more');
  });

  it('handles no change without claiming a direction', () => {
    const h = summarise([
      { date: '2025-01-01', rate: 12.0 },
      { date: '2026-01-01', rate: 12.0 },
    ])!;
    const text = describeHistory(h);
    expect(text).toContain('the same rate as the time before');
    expect(text).not.toMatch(/more|less/);
  });
});

describe('readAgainstOwnRange', () => {
  const at = (rate: number) =>
    summarise([
      { date: '2024-01-01', rate: 12.0 },
      { date: '2025-01-01', rate: 16.0 },
      { date: '2026-01-01', rate },
    ])!;

  it('calls a near-record yield the good side of the bargain for a lender', () => {
    expect(readAgainstOwnRange(at(15.9))).toContain('near the top');
  });

  it('flags a near-record low as worth comparing before committing', () => {
    expect(readAgainstOwnRange(at(12.1))).toContain('near the bottom');
  });

  it('calls the middle the middle', () => {
    expect(readAgainstOwnRange(at(14.0))).toContain('middle of its own history');
  });

  it('says a tight history offers little advantage in waiting', () => {
    const tight = summarise([
      { date: '2025-01-01', rate: 13.0 },
      { date: '2026-01-01', rate: 13.1 },
    ])!;
    expect(readAgainstOwnRange(tight)).toContain('little advantage in waiting');
  });

  it('always quotes the actual range so the reader can check the adjective', () => {
    expect(readAgainstOwnRange(at(15.9))).toContain('12.00% to 16.00%');
  });
});

describe('monthYear', () => {
  it('turns an ISO date into something a person would say', () => {
    expect(monthYear('2026-04-15')).toBe('April 2026');
  });

  it('returns anything unparseable unchanged rather than inventing a month', () => {
    expect(monthYear('rubbish')).toBe('rubbish');
  });
});
