import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  staleDatasetNotice,
  staleDatasets,
  type DatasetFreshness,
} from '../../src/lib/data-freshness';
import report from '../../public/data/freshness.json';

/**
 * The per-dataset verdict, and the reason it is published rather than computed.
 *
 * meta.generatedAt is the moment the pipeline last WROTE something, and until
 * now the site's banner was driven by it alone. Any single scraper succeeding
 * refreshes it, so a source that has been failing for three weeks sits behind
 * a stamp that says today. Issue #179 is exactly that: open, legitimate, and
 * invisible to a reader.
 *
 * The budgets themselves live in backend/scrapers/healthcheck.py with the
 * reasoning for each one, and are READ here. A second copy in TypeScript would
 * drift, and the copy that drifts is never the one that gets corrected.
 */

const datasets = report.datasets as DatasetFreshness[];

describe('the published freshness report', () => {
  it('covers the datasets the site depends on', () => {
    // Guards against a report that is present but empty, which would make
    // every check below iterate over nothing and pass.
    expect(datasets.length).toBeGreaterThanOrEqual(5);
    const files = datasets.map((d) => d.file);
    for (const required of ['macro.json', 'tbills.json', 'context.json']) {
      expect(files, `${required} is not covered`).toContain(required);
    }
  });

  it.each(datasets)('$file is fully described', (d) => {
    expect(d.label.length).toBeGreaterThan(3);
    expect(d.asOf, `asOf "${d.asOf}" is not an ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isInteger(d.ageDays)).toBe(true);
    expect(d.ageDays).toBeGreaterThanOrEqual(0);
    expect(d.budgetDays).toBeGreaterThan(0);
    // The flag must agree with the numbers beside it. If they can disagree,
    // the banner and the health table can tell a reader different things.
    expect(d.stale, `${d.file}: stale=${d.stale} but ${d.ageDays}d/${d.budgetDays}d`)
      .toBe(d.ageDays > d.budgetDays);
  });

  /**
   * THE BUDGETS MUST MATCH THE ONES THAT ACTUALLY GATE CI.
   *
   * This is the check that keeps "published, not recomputed" honest. If
   * healthcheck.py's BUDGETS were edited and freshness.json not regenerated,
   * the site would quietly report against a cadence CI no longer enforces —
   * a stale copy of a staleness check, which is the exact failure this whole
   * design is meant to avoid.
   */
  it('quotes the same budgets healthcheck.py enforces', () => {
    const py = readFileSync(
      new URL('../../backend/scrapers/healthcheck.py', import.meta.url).pathname,
      'utf8'
    );
    // ("macro.json", "Macro (CBR, CPI, FX)", "date", 40, "CPI is monthly"),
    const declared = new Map<string, number>();
    for (const m of py.matchAll(/\(\s*"([a-z-]+\.json)",\s*"[^"]*",\s*"[^"]*",\s*(\d+),/g)) {
      declared.set(m[1], Number(m[2]));
    }
    expect(declared.size, 'parsed no budgets from healthcheck.py').toBeGreaterThanOrEqual(5);

    for (const d of datasets) {
      expect(
        declared.get(d.file),
        `freshness.json says ${d.file} has a ${d.budgetDays}d budget; ` +
          `healthcheck.py says ${declared.get(d.file)}d. Re-run ` +
          `\`python healthcheck.py --publish\` after changing BUDGETS.`
      ).toBe(d.budgetDays);
    }
  });
});

describe('the notice', () => {
  it('says nothing when everything is inside its budget', () => {
    // Silence is the healthy state. A banner that is always there is a banner
    // nobody reads, which is how the real one gets missed.
    expect(staleDatasetNotice([])).toBeNull();
  });

  /**
   * THE GUARD MUST BE ABLE TO FIRE.
   *
   * Asserting only against today's data would pass just as well against
   * `staleDatasetNotice = () => null` — today every dataset is inside budget,
   * which is exactly when a staleness check is easiest to write wrong.
   */
  it('names the dataset, its age and its budget when one goes stale', () => {
    const notice = staleDatasetNotice([
      { file: 'tbills.json', label: 'Treasury bills', asOf: '2026-06-01', ageDays: 67, budgetDays: 21, stale: true },
    ]);
    expect(notice).toContain('Treasury bills');
    expect(notice).toContain('67');
    expect(notice).toContain('21');
    // "Some data is old" is not actionable; naming the source is the point.
    expect(notice).toMatch(/Central Bank/);
  });

  it('names every stale dataset, not just the first', () => {
    const notice = staleDatasetNotice([
      { file: 'tbills.json', label: 'Treasury bills', asOf: '2026-06-01', ageDays: 67, budgetDays: 21, stale: true },
      { file: 'macro.json', label: 'Macro (CBR, CPI, FX)', asOf: '2026-05-01', ageDays: 98, budgetDays: 40, stale: true },
    ]);
    expect(notice).toContain('Treasury bills');
    expect(notice).toContain('Macro (CBR, CPI, FX)');
  });

  it('reads the real report without throwing', () => {
    // staleDatasets() is what the component calls; today it should be empty,
    // and if it is not, the notice must still be well-formed rather than
    // undefined-shaped.
    const stale = staleDatasets();
    expect(Array.isArray(stale)).toBe(true);
    const notice = staleDatasetNotice();
    expect(stale.length === 0 ? notice === null : typeof notice === 'string').toBe(true);
  });
});
