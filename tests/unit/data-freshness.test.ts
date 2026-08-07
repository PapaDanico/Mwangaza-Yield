import { describe, it, expect } from 'vitest';
import {
  missedRuns, freshness, freshnessNotice, refreshCadence, QUIET_MISSES,
  REFRESH_HOURS_UTC, REFRESH_DAYS_UTC,
} from '../../src/lib/data-freshness';

/**
 * The refresh is `17 3,15 * * 1-6` — 03:17 and 15:17 UTC, Monday to Saturday,
 * and a slot is not counted as MISSED until four hours after it.
 *
 * Both of those are measurements rather than preferences. GitHub creates
 * scheduled runs off a contended queue: every run on this repository since the
 * cron was introduced started between 2h41m and 3h23m late, with created_at
 * equal to run_started_at. Minute 17 avoids the most contended slot; the grace
 * period absorbs what remains. Without it this module reported a missed update
 * every weekday morning.
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
  /* Slots are 03:17 and 15:17 UTC, and a slot is not MISSED until four hours
   * after it — see RUN_GRACE_HOURS. These cases were rewritten around that,
   * not patched until they went green: adjusting expected numbers would have
   * preserved assertions about a schedule that no longer exists, which is the
   * mistake this file's header already warns about once. */

  it('counts nothing straight after a successful run', () => {
    expect(missedRuns(at('2026-08-06T03:20:00Z'), at('2026-08-06T06:00:00Z'))).toBe(0);
  });

  it('DOES NOT count a run that is merely late — the daily wolf-cry case', () => {
    // THE DEFECT THIS GRACE PERIOD FIXES. Built Wednesday afternoon, read at
    // 06:00 Thursday. Thursday's 03:17 slot has passed but GitHub has not
    // started it yet, and on this scheduler it usually has not: six of six
    // observed runs started between 2h41m and 3h23m late. Without the grace
    // this reported a missed update every single weekday morning.
    expect(missedRuns(at('2026-08-05T15:20:00Z'), at('2026-08-06T06:00:00Z'))).toBe(0);
  });

  it('DOES count it once the grace has run out', () => {
    // 03:17 + 4h = 07:17. At 07:30 the run is genuinely overdue.
    expect(missedRuns(at('2026-08-05T15:20:00Z'), at('2026-08-06T07:30:00Z'))).toBe(1);
  });

  it('counts the afternoon run when the morning one produced the data', () => {
    // 03:20 Thursday to 20:00 Thursday: 15:17 was due by 19:17.
    expect(missedRuns(at('2026-08-06T03:20:00Z'), at('2026-08-06T20:00:00Z'))).toBe(1);
  });

  it('counts a full missed day', () => {
    // Thu 03:20 to Fri 20:00: Thu 15:17, Fri 03:17, Fri 15:17 — all past grace.
    expect(missedRuns(at('2026-08-06T03:20:00Z'), at('2026-08-07T20:00:00Z'))).toBe(3);
  });

  it('DOES count Saturday, which is scheduled', () => {
    expect(missedRuns(at('2026-08-07T15:20:00Z'), at('2026-08-08T20:00:00Z'))).toBe(2);
  });

  it('DOES NOT count Sunday — nothing we read publishes then', () => {
    const built = at('2026-08-08T15:20:00Z'); // Saturday afternoon
    expect(missedRuns(built, at('2026-08-09T09:00:00Z'))).toBe(0);
    expect(missedRuns(built, at('2026-08-09T23:59:00Z'))).toBe(0);
  });

  it('counts nothing at the worst legitimate moment: Monday 03:00', () => {
    // ~36 hours old and entirely correct — Monday's slot has not arrived.
    expect(missedRuns(at('2026-08-08T15:20:00Z'), at('2026-08-10T03:00:00Z'))).toBe(0);
  });

  it('counts Monday morning only once its grace has expired', () => {
    // 03:17 + 4h = 07:17. Still silent at 07:00, speaks at 07:30.
    expect(missedRuns(at('2026-08-08T15:20:00Z'), at('2026-08-10T07:00:00Z'))).toBe(0);
    expect(missedRuns(at('2026-08-08T15:20:00Z'), at('2026-08-10T07:30:00Z'))).toBe(1);
  });

  it('accumulates across a working week', () => {
    // Fri 07 15:20 -> Fri 14 09:00. Sat(2) + Sun(0) + Mon-Thu(8) + Fri 03:17
    // (due 07:17, before 09:00) = 11.
    expect(missedRuns(at('2026-08-07T15:20:00Z'), at('2026-08-14T09:00:00Z'))).toBe(11);
  });

  it('returns 0 for a stamp in the future', () => {
    expect(missedRuns(at('2026-08-20T03:17:00Z'), at('2026-08-06T09:00:00Z'))).toBe(0);
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

  it('uses the scheduled minute, not the top of the hour', () => {
    // Built 03:18 Thursday — one minute after the 03:17 slot, so that slot is
    // the one that produced this data and is not a miss.
    expect(missedRuns(at('2026-08-06T03:18:00Z'), at('2026-08-06T14:00:00Z'))).toBe(0);
    // Built 03:16 — one minute BEFORE it. The slot still is not missed until
    // 07:17, so at 14:00 it counts, and only it.
    expect(missedRuns(at('2026-08-06T03:16:00Z'), at('2026-08-06T14:00:00Z'))).toBe(1);
  });
});

describe('freshness', () => {
  it('is not stale after a single missed run', () => {
    const f = freshness(at('2026-08-06T20:00:00Z'), '2026-08-06T03:20:00Z');
    expect(f.missedRuns).toBe(1);
    expect(f.stale).toBe(false);
    expect(QUIET_MISSES).toBe(1);
  });

  it('is stale once misses clear the quiet threshold', () => {
    const f = freshness(at('2026-08-07T20:00:00Z'), '2026-08-06T03:20:00Z');
    expect(f.missedRuns).toBeGreaterThan(QUIET_MISSES);
    expect(f.stale).toBe(true);
  });

  it('is NEVER stale across a normal Sunday', () => {
    for (const now of ['2026-08-09T09:00:00Z', '2026-08-09T23:00:00Z', '2026-08-10T02:00:00Z']) {
      const f = freshness(at(now), '2026-08-08T15:20:00Z');
      expect(f.stale, `false alarm at ${now}`).toBe(false);
    }
  });

  it('reports age in days even when not stale', () => {
    const f = freshness(at('2026-08-09T20:00:00Z'), '2026-08-08T15:20:00Z');
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
    expect(freshnessNotice(freshness(at('2026-08-06T09:00:00Z'), '2026-08-06T03:20:00Z'))).toBeNull();
  });

  it('says nothing on a Sunday', () => {
    expect(freshnessNotice(freshness(at('2026-08-09T20:00:00Z'), '2026-08-08T15:20:00Z'))).toBeNull();
  });

  it('names the date and the consequence, not the mechanism', () => {
    const note = freshnessNotice(freshness(at('2026-08-12T09:00:00Z'), '2026-08-05T03:20:00Z'))!;
    expect(note).toBeTruthy();
    expect(note).toContain('2026-08-05');
    expect(note).toMatch(/check the Central Bank/);
    expect(note).toMatch(/indicative/);
  });
});

describe('refreshCadence', () => {
  it('describes the schedule the constants actually hold', () => {
    expect(refreshCadence()).toBe('twice a day, Monday to Saturday');
  });

  it('never says "weekday" while Saturday is scheduled', () => {
    // The home page said "Refreshed every weekday" and the cron change made it
    // false. Deriving the words is the fix; this asserts the derivation cannot
    // reproduce the original error.
    if (REFRESH_DAYS_UTC.includes(6)) {
      expect(refreshCadence()).not.toMatch(/weekday/);
    }
  });

  it('never says "once" while two runs are scheduled', () => {
    if (REFRESH_HOURS_UTC.length > 1) {
      expect(refreshCadence()).not.toMatch(/once a day/);
    }
  });
});
