import { describe, it, expect } from 'vitest';
import {
  missedRuns, freshness, freshnessNotice, QUIET_MISSES,
  REFRESH_HOURS_UTC, REFRESH_DAYS_UTC,
} from '../../src/lib/data-freshness';

/**
 * The refresh is `0 3,15 * * 1-6` — 03:00 and 15:00 UTC, Monday to Saturday.
 *
 * Every case is anchored to real weekdays so the weekend behaviour is tested
 * against the calendar rather than against an assumption about it:
 *   2026-08-06 Thursday   2026-08-08 Saturday
 *   2026-08-07 Friday     2026-08-09 SUNDAY      2026-08-10 Monday
 *
 * These were rewritten, not patched, when the schedule changed from weekdays-
 * once to Mon-Sat-twice. Adjusting the expected numbers until the old cases
 * went green would have preserved assertions about a calendar that no longer
 * exists.
 */
const at = (iso: string) => new Date(iso);

describe('the schedule constants', () => {
  it('is twice a day, Monday to Saturday', () => {
    expect(REFRESH_HOURS_UTC).toEqual([3, 15]);
    expect(REFRESH_DAYS_UTC).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('excludes Sunday, because nothing we read publishes then', () => {
    expect(REFRESH_DAYS_UTC).not.toContain(0);
  });
});

describe('missedRuns', () => {
  it('counts nothing straight after a successful run', () => {
    expect(missedRuns(at('2026-08-06T03:05:00Z'), at('2026-08-06T09:00:00Z'))).toBe(0);
  });

  it('counts the afternoon run when the morning one produced the data', () => {
    // 03:05 Thursday to 20:00 Thursday: 15:00 should have run.
    expect(missedRuns(at('2026-08-06T03:05:00Z'), at('2026-08-06T20:00:00Z'))).toBe(1);
  });

  it('counts both of a full missed day', () => {
    // Thursday 03:05 to Friday 20:00: Thu 15:00, Fri 03:00, Fri 15:00.
    expect(missedRuns(at('2026-08-06T03:05:00Z'), at('2026-08-07T20:00:00Z'))).toBe(3);
  });

  it('DOES count Saturday now that Saturday is scheduled', () => {
    // Friday 15:05 to Saturday 20:00: Sat 03:00 and Sat 15:00.
    expect(missedRuns(at('2026-08-07T15:05:00Z'), at('2026-08-08T20:00:00Z'))).toBe(2);
  });

  it('DOES NOT count Sunday — the wolf-crying case', () => {
    // Saturday 15:05 through Sunday: nothing is scheduled on a Sunday, so a
    // reader looking on Sunday evening sees data that is correct and current.
    const built = at('2026-08-08T15:05:00Z'); // Saturday afternoon
    expect(missedRuns(built, at('2026-08-09T09:00:00Z'))).toBe(0);
    expect(missedRuns(built, at('2026-08-09T23:59:00Z'))).toBe(0);
  });

  it('counts nothing at the worst legitimate moment: Monday 02:59', () => {
    // ~36 hours old and entirely correct — Monday's first run has not fired.
    expect(missedRuns(at('2026-08-08T15:05:00Z'), at('2026-08-10T02:59:00Z'))).toBe(0);
  });

  it('counts Monday morning once its run should have happened', () => {
    expect(missedRuns(at('2026-08-08T15:05:00Z'), at('2026-08-10T03:30:00Z'))).toBe(1);
  });

  it('accumulates across a working week', () => {
    // Friday 07 15:05 -> Friday 14 09:00. Sat(2) + Sun(0) + Mon-Thu(8) + Fri 03:00(1) = 11.
    expect(missedRuns(at('2026-08-07T15:05:00Z'), at('2026-08-14T09:00:00Z'))).toBe(11);
  });

  it('returns 0 for a stamp in the future', () => {
    expect(missedRuns(at('2026-08-20T03:00:00Z'), at('2026-08-06T09:00:00Z'))).toBe(0);
  });

  it('refuses an invalid date instead of throwing or looping', () => {
    expect(missedRuns(new Date('nonsense'), at('2026-08-06T09:00:00Z'))).toBe(0);
    expect(missedRuns(at('2026-08-06T09:00:00Z'), new Date('nonsense'))).toBe(0);
  });

  it('is bounded for an absurdly old stamp', () => {
    const n = missedRuns(at('1990-01-01T00:00:00Z'), at('2026-08-06T09:00:00Z'));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(800);
  });

  it('uses the scheduled hours, not midnight', () => {
    // Built 04:00 Thursday — after the 03:00 run, before the 15:00 one.
    // By 14:00 nothing further has been scheduled.
    expect(missedRuns(at('2026-08-06T04:00:00Z'), at('2026-08-06T14:00:00Z'))).toBe(0);
  });
});

describe('freshness', () => {
  it('is not stale after a single missed run', () => {
    const f = freshness(at('2026-08-06T20:00:00Z'), '2026-08-06T03:05:00Z');
    expect(f.missedRuns).toBe(1);
    expect(f.stale).toBe(false);
    expect(QUIET_MISSES).toBe(1);
  });

  it('is stale once misses clear the quiet threshold', () => {
    const f = freshness(at('2026-08-07T20:00:00Z'), '2026-08-06T03:05:00Z');
    expect(f.missedRuns).toBeGreaterThan(QUIET_MISSES);
    expect(f.stale).toBe(true);
  });

  it('is NEVER stale across a normal Sunday', () => {
    for (const now of ['2026-08-09T09:00:00Z', '2026-08-09T23:00:00Z', '2026-08-10T02:00:00Z']) {
      const f = freshness(at(now), '2026-08-08T15:05:00Z');
      expect(f.stale, `false alarm at ${now}`).toBe(false);
    }
  });

  it('reports age in days even when not stale', () => {
    const f = freshness(at('2026-08-09T20:00:00Z'), '2026-08-08T15:05:00Z');
    expect(f.ageDays).toBe(1);
    expect(f.stale).toBe(false);
  });

  it('treats an unreadable stamp as not-stale, not as an alarm', () => {
    const f = freshness(at('2026-08-06T09:00:00Z'), 'not-a-date');
    expect(f.stale).toBe(false);
    expect(f.missedRuns).toBe(0);
  });
});

describe('freshnessNotice', () => {
  it('says nothing when the data is current', () => {
    expect(freshnessNotice(freshness(at('2026-08-06T09:00:00Z'), '2026-08-06T03:05:00Z'))).toBeNull();
  });

  it('says nothing on a Sunday', () => {
    expect(freshnessNotice(freshness(at('2026-08-09T20:00:00Z'), '2026-08-08T15:05:00Z'))).toBeNull();
  });

  it('names the date and the consequence, not the mechanism', () => {
    const note = freshnessNotice(freshness(at('2026-08-12T09:00:00Z'), '2026-08-05T03:05:00Z'))!;
    expect(note).toBeTruthy();
    expect(note).toContain('2026-08-05');
    expect(note).toMatch(/check the Central Bank/);
    expect(note).toMatch(/indicative/);
  });
});
