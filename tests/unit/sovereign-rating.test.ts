import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SOVEREIGN_RATINGS,
  RATING_SOURCE,
  BAND_MEANING,
  ratingsDisagree,
} from '../../src/data/sovereign-rating';

/**
 * The dashboard asks "Can the borrower pay?" and answered it with seven World
 * Bank ratios and no credit rating — the one number that exists precisely to
 * answer that question, produced by people paid to answer it.
 *
 * Worse, several of those ratios render with a green "Supportive" dot on
 * thresholds generous enough that a reader could come away thinking a
 * single-B sovereign is the risk-free asset the textbooks describe.
 */
describe("Kenya's sovereign rating", () => {
  it('names all three agencies with a date for each', () => {
    const agencies = SOVEREIGN_RATINGS.map((r) => r.agency);
    expect(agencies).toHaveLength(3);
    expect(agencies.join(' ')).toMatch(/S&P/);
    expect(agencies.join(' ')).toMatch(/Fitch/);
    expect(agencies.join(' ')).toMatch(/Moody/);
    for (const r of SOVEREIGN_RATINGS) {
      expect(r.since, `${r.agency} has no assignment date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.rating.trim().length).toBeGreaterThan(0);
      expect(r.outlook.trim().length).toBeGreaterThan(0);
    }
  });

  it('carries a citable source rather than a remembered figure', () => {
    // The same rule as gazetted-holidays: a number nobody can check is the
    // failure, and a misdated rating is a false statement about credit risk.
    expect(RATING_SOURCE.title).toMatch(/Bulletin/i);
    expect(RATING_SOURCE.publisher).toMatch(/Central Bank of Kenya/);
    expect(RATING_SOURCE.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // No rating may predate... nor postdate the document it was read from.
    for (const r of SOVEREIGN_RATINGS) {
      expect(r.since <= RATING_SOURCE.asOf, `${r.agency} is dated after its source`).toBe(true);
    }
  });

  it('shows the direction of travel where the source gave it', () => {
    // Moody's B3 in Jan 2026 is an UPGRADE from Caa1. A rating shown without
    // its predecessor loses the only part a reader can act on.
    const moodys = SOVEREIGN_RATINGS.find((r) => r.agency.startsWith('Moody'));
    expect(moodys?.rating).toBe('B3');
    expect(moodys?.previous?.rating).toBe('Caa1');
    expect(moodys!.previous!.since < moodys!.since).toBe(true);
  });

  it('knows that B- and B3 are the same rung', () => {
    // Different alphabets, identical credit quality. Rendering them without a
    // mapping invents disagreement between Fitch and Moody's that does not
    // exist — and hides the real one, which is S&P sitting a notch above.
    const fitch = SOVEREIGN_RATINGS.find((r) => r.agency === 'Fitch')!;
    const moodys = SOVEREIGN_RATINGS.find((r) => r.agency.startsWith('Moody'))!;
    expect(fitch.rating).toBe('B-');
    expect(moodys.rating).toBe('B3');
    expect(ratingsDisagree([fitch, moodys]), 'B- and B3 read as different rungs').toBe(false);
    // S&P at B is one notch higher, so the full set DOES disagree.
    expect(ratingsDisagree()).toBe(true);
  });

  it('says what the band means without predicting default', () => {
    expect(BAND_MEANING).toMatch(/speculative/i);
    // The honest framing: the yield is payment for the risk, not a warning to
    // stay away. Saying "risky" and stopping would be its own distortion.
    expect(BAND_MEANING).toMatch(/yield/i);
    expect(BAND_MEANING).not.toMatch(/will default|avoid these|do not buy/i);
  });
});

/**
 * The rating is only worth adding if a reader meets it.
 *
 * "Can the borrower pay?" is rendered by SovereignContext. A rating that lived
 * in the data and never reached that component would be the same gap with more
 * files.
 */
describe('the rating reaches the surface that asks the question', () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

  it('is rendered by the panel that asks whether the borrower can pay', () => {
    const src = read('src/components/dashboard/SovereignContext.tsx');
    expect(src, 'SovereignContext does not import the rating').toMatch(/sovereign-rating/);
    expect(src, 'the rating is imported but never rendered').toMatch(/SOVEREIGN_RATINGS/);
    expect(src, 'the band is never explained to the reader').toMatch(/BAND_MEANING/);
  });

  it('attributes the figures on the page that shows them', () => {
    const src = read('src/components/dashboard/SovereignContext.tsx');
    expect(src, 'ratings are shown with no source named').toMatch(/RATING_SOURCE/);
  });
});
