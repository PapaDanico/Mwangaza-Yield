import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { yieldContext, analogueStrength } from '../../src/lib/regime';
import type { AuctionPrint, Bond } from '../../src/types/bond';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8'));
const PRINTS: AuctionPrint[] = read('public/data/auction-results.json');
const BONDS: Bond[] = read('public/data/bonds.json');
const TODAY = '2026-07-31';

/**
* The yield-history lens is the feature most able to mislead, so it is tested for
 * restraint rather than for cleverness.
 *
 * "Rates were last here in 2019" is an easy sentence to write and a dangerous
 * one to believe: Kenya has had about two full rate cycles in this archive.
 * Any claim shaped like "this happened before, so it will happen again" rests
 * on a sample that would embarrass anyone who said the number out loud — and
 * the temptation is to say it quietly instead, confidently, with the sample
 * omitted. These tests exist to make the sample impossible to omit.
 */
describe('where a yield sits in its own history', () => {
  it('returns the sample it rests on, always', () => {
    /* The number that makes the percentile honest. A 70th percentile from 66
     * auctions and one from 6 are different claims and must not be printed in
     * the same voice. */
    const y = yieldContext(PRINTS, BONDS, 10, TODAY)!;
    expect(y.observations).toBeGreaterThan(20);
    expect(y.percentile).toBeGreaterThanOrEqual(0);
    expect(y.percentile).toBeLessThanOrEqual(1);
  });

  it('reports how old the latest print is, because some tenors are stale', () => {
    /* The two-year's most recent auction in the shipped archive is from 2024.
     * Presenting that rate without its date would state a two-year-old number
     * as though it were today's, which is the exact failure ytmAsOf exists to
     * prevent elsewhere in this codebase. */
    const y = yieldContext(PRINTS, BONDS, 2, TODAY);
    if (y) {
      expect(y.latestDate, 'no date accompanies the rate').toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(y.latestDate <= TODAY).toBe(true);
    }
  });

  it('never counts an auction that had not happened yet', () => {
    const y = yieldContext(PRINTS, BONDS, 10, '2020-01-01')!;
    expect(y.latestDate <= '2020-01-01').toBe(true);
    const now = yieldContext(PRINTS, BONDS, 10, TODAY)!;
    expect(y.observations).toBeLessThan(now.observations);
  });

  it('looks past the last year when saying "we were last here"', () => {
    /* Without the exclusion this almost always answers "a few weeks ago",
     * which is true, useless, and reads as though nothing has changed. */
    const y = yieldContext(PRINTS, BONDS, 10, TODAY)!;
    if (y.lastSeenAt) {
      const yearAgo = new Date(new Date(TODAY).getTime() - 365 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(y.lastSeenAt < yearAgo).toBe(true);
    }
  });

  it('says nothing when there is nothing to say', () => {
    expect(yieldContext(PRINTS, BONDS, 97, TODAY), 'invented a 97-year tenor').toBeNull();
    expect(yieldContext([], BONDS, 10, TODAY)).toBeNull();
  });
});

describe('how loudly an analogue may speak', () => {
  it('grades by sample size, and can say "not enough"', () => {
    /* A regime lens that cannot return "I don't know" is a horoscope. */
    expect(analogueStrength(0)).toBe('none');
    expect(analogueStrength(4)).toBe('none');
    expect(analogueStrength(10)).toBe('weak');
    expect(analogueStrength(50)).toBe('moderate');
  });

  it('never reaches "strong", because the history cannot support it', () => {
    /* Two full rate cycles do not make a strong claim, however many auctions
     * they contain — auctions inside one cycle move together. The scale stops
     * at moderate deliberately, so no future edit can promote a crowded
     * sample to a confident one without changing this test on purpose. */
    const grades = [0, 5, 20, 500, 100_000].map(analogueStrength);
    expect(grades).not.toContain('strong');
  });
});
