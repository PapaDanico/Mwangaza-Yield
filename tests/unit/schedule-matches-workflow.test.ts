import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REFRESH_HOURS_UTC, REFRESH_DAYS_UTC } from '../../src/lib/data-freshness';

/**
 * `data-freshness.ts` holds a COPY of the refresh schedule, and a copy is a
 * thing that goes out of date.
 *
 * It nearly did so the moment it was written. The cron changed from
 * `0 3 * * 1-5` to `0 3,15 * * 1-6` in the same commit that introduced the
 * module, and leaving the old shape in the constants would have had the
 * staleness banner under-count missed runs — silently, and in the direction
 * that reassures. A check made wrong by the fix standing next to it.
 *
 * So the workflow file is the single source of truth and this parses it. If
 * somebody changes the cron and not the constants, this fails and names both.
 */

const CI = readFileSync('.github/workflows/ci.yml', 'utf8');

/** Every `- cron: '...'` under the schedule trigger. */
function cronLines(): string[] {
  return [...CI.matchAll(/^\s*-\s*cron:\s*'([^']+)'/gm)].map((m) => m[1]);
}

/** Expand `3,15` / `1-6` / `*` into the numbers it means. */
function expandField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1) out.add(n);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    } else {
      throw new Error(`unsupported cron field: ${part}`);
    }
  }
  return [...out].sort((a, b) => a - b);
}

describe('the refresh schedule in ci.yml', () => {
  it('has exactly one cron entry, so there is one thing to mirror', () => {
    // More than one would make "the schedule" ambiguous and this check wrong.
    expect(cronLines()).toHaveLength(1);
  });

  it('matches REFRESH_HOURS_UTC', () => {
    const [, hour] = cronLines()[0].split(/\s+/);
    expect(expandField(hour, 0, 23)).toEqual([...REFRESH_HOURS_UTC].sort((a, b) => a - b));
  });

  it('matches REFRESH_DAYS_UTC', () => {
    const dow = cronLines()[0].split(/\s+/)[4];
    expect(expandField(dow, 0, 6)).toEqual([...REFRESH_DAYS_UTC].sort((a, b) => a - b));
  });

  it('runs on the hour, since the constants model whole hours only', () => {
    expect(cronLines()[0].split(/\s+/)[0]).toBe('0');
  });
});

describe('the parser this check depends on', () => {
  // Guards against the check passing because expandField returns nothing
  // sensible — a comparison of two empty arrays is not a comparison.
  it('expands a list', () => {
    expect(expandField('3,15', 0, 23)).toEqual([3, 15]);
  });

  it('expands a range', () => {
    expect(expandField('1-6', 0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('expands a star', () => {
    expect(expandField('*', 0, 6)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('refuses a field it does not understand rather than guessing', () => {
    // `*/2` is valid cron this parser does not model. Silently returning
    // something plausible would make the comparison above meaningless.
    expect(() => expandField('*/2', 0, 23)).toThrow();
  });

  it('actually finds a cron line in the real workflow', () => {
    expect(cronLines()[0]).toMatch(/^\d+\s/);
  });
});
