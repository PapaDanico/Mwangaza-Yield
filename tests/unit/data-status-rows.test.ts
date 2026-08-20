/**
 * Every dataset the panel fetches must appear in it, and nothing may be
 * fetched that is never shown.
 *
 * WHY THIS FILE EXISTS
 *
 * DataStatus draws its rows from freshness.json — one cadence table rather
 * than two, which was the right correction. But it scores quality from its own
 * SCORED list, and the two were never reconciled. The result faced both ways:
 *
 *   - bonds.json and auctions.json were fetched on every panel open, scored,
 *     and rendered nowhere. Work done and discarded, on phones too.
 *   - The two datasets a reader most expects under "Data Health" were absent.
 *
 * The obvious repair — put them back into freshness.json — would have been
 * wrong, and this is the part worth pinning. Neither carries a date saying
 * when it was fetched. bonds.json holds issueDate and maturityDate, which
 * describe the instrument. auctions.json is dated by auction and its newest
 * is SCHEDULED, so its age is negative: the exact defect that caused the
 * panel's own per-dataset rule to be removed in the first place.
 *
 * So the invariant is not "these files are in freshness.json". It is that
 * every scored file is accounted for somewhere — aged if it can be, and
 * explicitly not-aged with a reason if it cannot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'shared', 'DataStatus.tsx'),
  'utf8'
);
const FRESHNESS = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'freshness.json'), 'utf8')
);

/** Filenames listed in the component's SCORED array. */
function scoredFiles(): string[] {
  const block = SRC.slice(SRC.indexOf('const SCORED = ['), SRC.indexOf('] as const;'));
  return [...block.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Filenames given an explicit no-age reason. */
function notAgeChecked(): Record<string, string> {
  const start = SRC.indexOf('const NOT_AGE_CHECKED');
  const block = SRC.slice(start, SRC.indexOf('};', start));
  return Object.fromEntries(
    [...block.matchAll(/'([^']+\.json)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
  );
}

const SCORED = scoredFiles();
const EXEMPT = notAgeChecked();
const AGED: string[] = FRESHNESS.datasets.map((d: { file: string }) => d.file);

describe('the sweep itself', () => {
  it('actually found the lists it is checking', () => {
    // A regex that silently matches nothing turns this file into decoration.
    expect(SCORED.length).toBeGreaterThan(2);
    expect(Object.keys(EXEMPT).length).toBeGreaterThan(0);
    expect(AGED.length).toBeGreaterThan(2);
  });
});

describe('nothing is fetched and then hidden', () => {
  it('shows every dataset it downloads, as an aged row or an explained one', () => {
    const orphaned = SCORED.filter((f) => !AGED.includes(f) && !(f in EXEMPT));
    expect(
      orphaned,
      'These are fetched to compute a quality score that the panel never ' +
        'renders. Either add the file to the freshness budgets in ' +
        'backend/scrapers/healthcheck.py, or give it a NOT_AGE_CHECKED reason ' +
        'saying why it has no meaningful age.'
    ).toEqual([]);
  });

  it('does not carry a no-age reason for a dataset it never fetches', () => {
    // The mirror failure: an exemption outliving the row it excused is stale
    // permission waiting to excuse something else.
    const unused = Object.keys(EXEMPT).filter((f) => !SCORED.includes(f));
    expect(unused, 'NOT_AGE_CHECKED entries with nothing to explain').toEqual([]);
  });
});

describe('the exemptions stay honest', () => {
  it('gives a real reason, not a placeholder', () => {
    for (const [file, why] of Object.entries(EXEMPT)) {
      expect(why.length, `${file} has no reason worth reading`).toBeGreaterThan(25);
    }
  });

  it('never exempts a dataset freshness.json does age-check', () => {
    // If a file gains a real budget, the exemption becomes a lie that hides a
    // working check.
    const contradictory = Object.keys(EXEMPT).filter((f) => AGED.includes(f));
    expect(
      contradictory,
      'freshness.json now ages these, so the no-age reason is false — delete it'
    ).toEqual([]);
  });
});
