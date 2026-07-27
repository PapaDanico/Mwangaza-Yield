import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { latestInflation, CPI_MAX_AGE_DAYS } from '../../src/lib/real-yield';
import type { MacroIndicator } from '../../src/types/bond';

/**
 * A date that refreshes over a value that does not.
 *
 * The scraper stamped every indicator with the day it ran. For USD/KES, which
 * moves daily, that is near enough true. For CPI it was not: KNBS publishes it
 * monthly, and re-stamping an unchanged 6.41% every morning presented a figure
 * from weeks earlier as observed today.
 *
 * The cost was not cosmetic. `stale` here is derived from that date, so it
 * could never become true — the staleness guard was disarmed by the very
 * pipeline it was meant to police, every single day, with nobody deciding to.
 * These checks hold both halves: that an unchanged figure keeps its real age,
 * and that a substitute source announces itself.
 */

const cpi = (over: Partial<MacroIndicator> = {}): MacroIndicator =>
  ({
    id: 'cpi-1',
    indicator: 'CPI',
    value: 6.41,
    date: '2026-07-27',
    unit: '% y/y',
    source: 'KNBS',
    ...over,
  }) as MacroIndicator;

describe('inflation provenance', () => {
  it('ages a figure from when it was observed, not when it was fetched', () => {
    const reading = latestInflation([cpi({ date: '2026-03-01' })], new Date('2026-07-27'));
    expect(reading!.ageDays).toBeGreaterThan(CPI_MAX_AGE_DAYS);
    expect(
      reading!.stale,
      'a CPI print months old must read as stale — this was permanently false while the scraper re-dated it daily'
    ).toBe(true);
  });

  it('flags a substitute source, including in the legacy string form', () => {
    // Records written before the `fallback` field encode it in the source
    // text. Both shapes must reach the reader as the same fact.
    expect(latestInflation([cpi({ source: 'CBK (KNBS unavailable)' })])!.fallback).toBe(true);
    expect(latestInflation([cpi({ source: 'CBK', fallback: true })])!.fallback).toBe(true);
    expect(latestInflation([cpi({ source: 'KNBS' })])!.fallback).toBe(false);
  });

  /**
   * The live figure must not be copied into prose.
   *
   * The glossary explained real yield using "6.41% inflation" written out by
   * hand, in two entries. That number comes from the feed and changes; the
   * prose does not. It is the same defect as the four hardcoded MMF yields in
   * the sister product — a figure true when typed, wrong the month after, and
   * carrying none of its own provenance.
   */
  it('no prose hardcodes the current inflation rate', () => {
    const live = latestInflation(readMacro());
    expect(live, 'no CPI print in macro.json to check against').toBeTruthy();
    const needle = live!.rate.toFixed(2);

    const SRC = new URL('../../src', import.meta.url).pathname;
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx?$/.test(full) ? [full] : [];
      });

    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          if (line.replace(/\/\/.*$/, '').includes(needle)) {
            offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim().slice(0, 88)}`);
          }
        });
    }
    expect(
      offenders,
      `these quote the live inflation rate (${needle}%) as a literal; read it from the feed:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

function readMacro(): MacroIndicator[] {
  const path = new URL('../../public/data/macro.json', import.meta.url).pathname;
  return JSON.parse(readFileSync(path, 'utf8')) as MacroIndicator[];
}
