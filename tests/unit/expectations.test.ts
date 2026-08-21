/**
 * Expectations must never be mistaken for measurements.
 *
 * The figures here are the opinions of 400 firms, collected by CBK before an
 * MPC meeting. Everything else in public/data is a published statistic. The
 * tests below pin the boundary between the two, because the failure mode is
 * silent: a forecast rendered like a measurement looks exactly like a
 * measurement, and the reader acts on it as though somebody counted something.
 */
import { describe, it, expect } from 'vitest';
import {
  EXPECTATIONS,
  inflationExpectations,
  expectationForTenor,
  expectedRealRate,
  expectationsSource,
} from '../../src/lib/expectations';
import { licenceFor, mayRedistribute } from '../../src/lib/licences';
import { macroRegime } from '../../src/lib/macro-regime';

describe('the shipped survey data', () => {
  it('is present and attributed on every row', () => {
    expect(EXPECTATIONS.length).toBeGreaterThan(4);
    for (const r of EXPECTATIONS) {
      expect(r.source, `${r.id} has no source`).toBeTruthy();
      expect(r.sourceUrl, `${r.id} has no source URL`).toMatch(/^https:\/\//);
      expect(r.surveyDate, `${r.id} has no survey date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('cites a source we may actually redistribute', () => {
    for (const r of EXPECTATIONS) {
      expect(licenceFor(r.source)?.id, `${r.source} is unregistered`).toBe('CBK');
      expect(mayRedistribute(r.source)).toBe(true);
    }
  });

  it('names the survey rather than implying a measurement', () => {
    // "CBK" alone would read as a CBK statistic. The publication has to be in
    // the string, because that is what tells a reader this is a survey.
    for (const r of EXPECTATIONS) {
      expect(r.source).toMatch(/Market Perceptions Survey/i);
    }
  });
});

describe('grouping keeps the disagreement visible', () => {
  it('reports banks and non-banks separately, not averaged away', () => {
    const oneYear = inflationExpectations().find((h) => h.horizonMonths === 12);
    expect(oneYear).toBeDefined();
    expect(oneYear!.banks).toBe(6.24);
    expect(oneYear!.nonBanks).toBe(5.05);
    // The gap between the two panels is over a point. Publishing only a blend
    // would hide the single most interesting thing in the July survey.
    expect(Math.abs(oneYear!.banks! - oneYear!.nonBanks!)).toBeGreaterThan(1);
  });

  it('orders horizons shortest first', () => {
    const months = inflationExpectations().map((h) => h.horizonMonths);
    expect(months).toEqual([...months].sort((a, b) => a - b));
  });

  it('midpoint sits between the two panels', () => {
    for (const h of inflationExpectations()) {
      if (h.banks === null || h.nonBanks === null) continue;
      const lo = Math.min(h.banks, h.nonBanks);
      const hi = Math.max(h.banks, h.nonBanks);
      expect(h.midpoint!).toBeGreaterThanOrEqual(lo);
      expect(h.midpoint!).toBeLessThanOrEqual(hi);
    }
  });
});

describe('matching an expectation to a bond', () => {
  it('picks the nearest horizon to the remaining life', () => {
    expect(expectationForTenor(1)?.horizonMonths).toBe(12);
    expect(expectationForTenor(2)?.horizonMonths).toBe(24);
    expect(expectationForTenor(5)?.horizonMonths).toBe(60);
    // A 10-year bond has no 10-year survey horizon; the longest available is
    // the honest choice, not an extrapolation invented here.
    expect(expectationForTenor(10)?.horizonMonths).toBe(60);
  });

  it('refuses a nonsensical tenor rather than guessing', () => {
    expect(expectationForTenor(0)).toBeNull();
    expect(expectationForTenor(-3)).toBeNull();
    expect(expectationForTenor(Number.NaN)).toBeNull();
  });
});

describe('expectedRealRate', () => {
  it('subtracts the matching expectation from the nominal', () => {
    const r = expectedRealRate(13.24, 5, 'banks');
    expect(r).not.toBeNull();
    expect(r!.expectedInflation).toBe(5.42);
    expect(r!.realRate).toBeCloseTo(13.24 - 5.42, 6);
  });

  it('returns null for a missing nominal rather than treating it as zero', () => {
    // The defect this codebase has produced most often. A "real rate" computed
    // from an absent nominal would render as a confident negative number.
    expect(expectedRealRate(null, 5)).toBeNull();
    expect(expectedRealRate(Number.NaN, 5)).toBeNull();
  });

  it('always returns the qualifier alongside the figure', () => {
    const r = expectedRealRate(13.24, 5);
    expect(r!.restsOnOpinion).toBe(true);
    expect(r!.basis, 'the basis must say whose opinion it is').toMatch(/banks|firms/);
  });

  it('names the horizon it used, so the reader can check the match', () => {
    expect(expectedRealRate(13.24, 1)!.basis).toContain('Next 1 year');
    expect(expectedRealRate(13.24, 5)!.basis).toContain('Next 5 years');
  });
});

describe('opinions stay out of verdicts', () => {
  it('macroRegime reaches the same conclusion regardless of the survey', () => {
    // The boundary that matters. macroRegime judges measured figures. If an
    // expectation ever became an input, deleting this file would change a
    // recommendation — and an opinion that moves a verdict is an opinion
    // wearing a measurement's clothes.
    const before = macroRegime(8.75, 6.49, null, null, 'neutral');
    expect(before.label).toBe('Mixed signals — selectivity rewarded');
    expect(before.tags.map((t) => t.text).join(' ')).not.toMatch(/expect|survey|perception/i);
  });
});

describe('attribution is available at the point of use', () => {
  it('exposes the survey, its URL and its date together', () => {
    const s = expectationsSource();
    expect(s).not.toBeNull();
    expect(s!.source).toMatch(/Market Perceptions Survey/);
    expect(s!.sourceUrl).toMatch(/^https:\/\/www\.centralbank\.go\.ke\//);
    expect(s!.surveyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
