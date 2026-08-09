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

  it('does not state the fallback twice', () => {
    // The card says "a stand-in, because KNBS could not be reached" in words.
    // Leaving the legacy parenthetical in the source produced a sentence that
    // said it twice: "Inflation is CBK (KNBS unavailable) — a stand-in,
    // because KNBS could not be reached." Found by reading the page; no
    // assertion on either half alone could see it.
    const reading = latestInflation([cpi({ source: 'CBK (KNBS unavailable)' })])!;
    expect(reading.source).toBe('CBK');
    expect(reading.fallback, 'cleaning the string must not lose the fact').toBe(true);
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

describe('what /sources tells a reader about KNBS', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/sources/page.tsx'),
    'utf8'
  );

  /**
   * The page used to say we read the CPI from CBK because that was "the copy we
   * can fetch reliably". True, and evasive: it reads as a preference. The
   * measured reason is narrower and far more checkable — knbs.or.ke answers,
   * but serves no intermediate certificate, so the chain does not verify. A
   * browser papers over that by fetching the missing link itself; requests
   * refuses, and we do not turn verification off to collect financial data.
   *
   * That distinction matters to a reader deciding whether to trust the
   * substitution. "We could not be bothered" and "the publisher's certificate
   * is misconfigured and we will not disable verification" are different
   * claims, and only one of them is ours to be judged on.
   */
  it('gives the specific reason, not a vague preference', () => {
    expect(page).toMatch(/certificate chain does not verify|chain does not verify/);
    expect(
      page,
      'the reason must name certificate verification, or it has been softened back to a preference'
    ).toMatch(/verification/);
  });

  /* The one sentence that must never be quietly deleted: it is the promise
   * that we did not take the easy route through --insecure. */
  it('states that verification is not disabled to collect financial data', () => {
    expect(page).toMatch(/do not disable certificate verification|not disable certificate verification/i);
  });

  /* A claim about a live third party needs a date, or a reader cannot tell
   * whether it was checked this year or three years ago. KNBS may fix the
   * chain tomorrow, at which point this paragraph becomes false — the date is
   * what lets somebody notice. */
  it('dates the last time the failure was actually observed', () => {
    // Scoped to the KNBS entry, NOT the whole page. The first version of this
    // matched any date anywhere in the file and passed happily against the old
    // vague copy — a guard that survives the mutation it exists to catch is
    // decoration. The World Bank entry alone carries enough prose to keep it
    // green forever.
    const entry = page.slice(
      page.indexOf('Kenya National Bureau of Statistics'),
      page.indexOf('World Bank Open Data')
    );
    expect(entry.length, 'failed to isolate the KNBS entry').toBeGreaterThan(200);
    expect(
      entry,
      'an availability claim with no date cannot be audited or expired'
    ).toMatch(/\d{1,2} [A-Z][a-z]+ 20\d\d/);
  });
});
