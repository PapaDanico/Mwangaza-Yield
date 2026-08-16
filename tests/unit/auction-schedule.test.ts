/**
 * A date in the past must never be printed as the next auction.
 *
 * This is not hypothetical. On 16 August 2026 `/tbills/` read:
 *
 *     Minimum Ksh 100,000, then multiples of Ksh 50,000 · next auction 2026-08-06
 *
 * The row was scraped from the 30 July auction, which correctly named 6 August
 * as the one after it. Two weekly auctions then passed without the T-bill rows
 * refreshing, and nothing checked whether the stored date had aged out.
 *
 * The distinction that makes this worth a guard: a stale RATE is a disclosed
 * inaccuracy — every figure carries its `asOf` and the freshness banner says
 * when the pipeline last ran. A past date labelled "next" is not old, it is
 * wrong, and a reader deciding which Thursday to bid on cannot tell.
 */
import { describe, it, expect } from 'vitest';
import { isUpcoming, nextAuctionLabel } from '../../src/lib/auction-schedule';

const on = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe('isUpcoming', () => {
  it('rejects the date that actually shipped', () => {
    // The exact pairing seen in production.
    expect(isUpcoming('2026-08-06', on('2026-08-16'))).toBe(false);
  });

  it('accepts a date still ahead', () => {
    expect(isUpcoming('2026-08-20', on('2026-08-16'))).toBe(true);
  });

  it('counts an auction happening today as upcoming', () => {
    // Auction day is not the day to hide the date. Compared by calendar day
    // rather than by instant so a reader in Nairobi does not lose it because a
    // UTC clock rolled over first.
    expect(isUpcoming('2026-08-20', on('2026-08-20'))).toBe(true);
  });

  it('treats a missing or malformed date as not upcoming', () => {
    // Silence is the safe direction: printing nothing loses a reader nothing,
    // printing rubbish costs them trust in every other figure on the page.
    expect(isUpcoming('', on('2026-08-16'))).toBe(false);
    expect(isUpcoming('not-a-date', on('2026-08-16'))).toBe(false);
  });
});

describe('nextAuctionLabel', () => {
  it('returns the date when it is still ahead', () => {
    expect(nextAuctionLabel('2026-08-20', on('2026-08-16'))).toBe('2026-08-20');
  });

  it('returns null once it has passed, so the caller drops the clause', () => {
    // Null rather than "unknown": the rest of that line — the minimum and the
    // multiples — is still true, and a placeholder would be noise beside it.
    expect(nextAuctionLabel('2026-08-06', on('2026-08-16'))).toBeNull();
  });

  it('does not invent the real date', () => {
    // Tempting, and wrong. T-bills are weekly on Thursdays, so the next one is
    // a two-line calculation — but CBK moves auctions for public holidays, and
    // the 364-day tenor is under notice to be phased out. A computed Thursday
    // would look identical to a scraped one and carry none of its authority.
    const label = nextAuctionLabel('2026-08-06', on('2026-08-16'));
    expect(label).not.toBe('2026-08-20');
    expect(label).toBeNull();
  });
});
