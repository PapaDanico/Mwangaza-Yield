import { describe, it, expect } from 'vitest';
import {
  missedRuns, freshness, freshnessNotice, QUIET_MISSES, REFRESH_HOUR_UTC,
} from '../../src/lib/data-freshness';

/**
 * The refresh is `0 3 * * 1-5`. Every case below is anchored to real weekdays
 * so the weekend behaviour is tested against the calendar rather than against
 * an assumption about it.
 *
 * 2026-08-06 is a Thursday. 08 is Saturday, 09 Sunday, 10 Monday.
 */
const at = (iso: string) => new Date(iso);

describe('missedRuns', () => {
  it('counts nothing on the morning of a successful run', () => {
    expect(missedRuns(at('2026-08-06T03:05:00Z'), at('2026-08-06T09:00:00Z'))).toBe(0);
  });

  it('counts one when the next weekday run did not happen', () => {
    // Built Thursday 03:05, now Friday 09:00 — Friday's run is missing.
    expect(missedRuns(at('2026-08-06T03:05:00Z'), at('2026-08-07T09:00:00Z'))).toBe(1);
  });

  it('DOES NOT count the weekend — the wolf-crying case', () => {
    // Built Friday, now Sunday evening. Data is 2.5 days old and completely
    // normal: nothing was scheduled on Saturday or Sunday. A plain age
    // threshold would warn here every single week.
    const built = at('2026-08-07T03:05:00Z'); // Friday
    expect(missedRuns(built, at('2026-08-08T20:00:00Z'))).toBe(0); // Saturday
    expect(missedRuns(built, at('2026-08-09T20:00:00Z'))).toBe(0); // Sunday
  });

  it('still counts nothing at the worst legitimate moment: Monday 02:59', () => {
    // Nearly three days old, and correct — Monday's run has not fired yet.
    expect(missedRuns(at('2026-08-07T03:05:00Z'), at('2026-08-10T02:59:00Z'))).toBe(0);
  });

  it('counts Monday once its run should have happened', () => {
    expect(missedRuns(at('2026-08-07T03:05:00Z'), at('2026-08-10T09:00:00Z'))).toBe(1);
  });

  it('accumulates across a working week', () => {
    // Built Friday 7th; now Friday 14th. Mon-Fri = 5 missed.
    expect(missedRuns(at('2026-08-07T03:05:00Z'), at('2026-08-14T09:00:00Z'))).toBe(5);
  });

  it('returns 0 rather than a negative for a stamp in the future', () => {
    expect(missedRuns(at('2026-08-20T03:00:00Z'), at('2026-08-06T09:00:00Z'))).toBe(0);
  });

  it('refuses an invalid date instead of throwing or looping', () => {
    expect(missedRuns(new Date('nonsense'), at('2026-08-06T09:00:00Z'))).toBe(0);
    expect(missedRuns(at('2026-08-06T09:00:00Z'), new Date('nonsense'))).toBe(0);
  });

  it('is bounded for an absurdly old stamp', () => {
    const n = missedRuns(at('1990-01-01T00:00:00Z'), at('2026-08-06T09:00:00Z'));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(400);
  });

  it('uses the scheduled hour, not midnight', () => {
    // Built Thursday 04:00 — AFTER that day's 03:00 run. Now Thursday 23:00.
    // Nothing further was scheduled, so nothing is missed.
    expect(missedRuns(at('2026-08-06T04:00:00Z'), at('2026-08-06T23:00:00Z'))).toBe(0);
    expect(REFRESH_HOUR_UTC).toBe(3);
  });
});

describe('freshness', () => {
  it('is not stale after a single missed run', () => {
    // carry_forward covers one failure and the pipeline's own alert reports it
    // better. Duplicating that here would be noise.
    const f = freshness(at('2026-08-07T09:00:00Z'), '2026-08-06T03:05:00Z');
    expect(f.missedRuns).toBe(1);
    expect(f.stale).toBe(false);
    expect(QUIET_MISSES).toBe(1);
  });

  it('is stale once misses clear the quiet threshold', () => {
    const f = freshness(at('2026-08-10T09:00:00Z'), '2026-08-05T03:05:00Z');
    expect(f.missedRuns).toBeGreaterThan(QUIET_MISSES);
    expect(f.stale).toBe(true);
  });

  it('is NEVER stale across a normal weekend', () => {
    for (const now of ['2026-08-08T12:00:00Z', '2026-08-09T23:00:00Z', '2026-08-10T02:00:00Z']) {
      const f = freshness(at(now), '2026-08-07T03:05:00Z');
      expect(f.stale, `false alarm at ${now}`).toBe(false);
    }
  });

  it('reports age in days even when not stale', () => {
    const f = freshness(at('2026-08-09T09:00:00Z'), '2026-08-07T03:05:00Z');
    expect(f.ageDays).toBe(2);
    expect(f.stale).toBe(false);
  });

  it('treats an unreadable stamp as not-stale, not as an alarm', () => {
    // An alarm here would be about a deployment, not about the data.
    const f = freshness(at('2026-08-06T09:00:00Z'), 'not-a-date');
    expect(f.stale).toBe(false);
    expect(f.missedRuns).toBe(0);
  });
});

describe('freshnessNotice', () => {
  it('says nothing when the data is current', () => {
    expect(freshnessNotice(freshness(at('2026-08-06T09:00:00Z'), '2026-08-06T03:05:00Z'))).toBeNull();
  });

  it('says nothing on a weekend', () => {
    expect(freshnessNotice(freshness(at('2026-08-09T20:00:00Z'), '2026-08-07T03:05:00Z'))).toBeNull();
  });

  it('names the date and the consequence, not the mechanism', () => {
    const note = freshnessNotice(freshness(at('2026-08-12T09:00:00Z'), '2026-08-05T03:05:00Z'))!;
    expect(note).toBeTruthy();
    expect(note).toContain('2026-08-05');
    // The reader is deciding where to put money; "the pipeline missed N runs"
    // is not the register that helps them.
    expect(note).toMatch(/check the Central Bank/);
    expect(note).toMatch(/indicative/);
  });
});
