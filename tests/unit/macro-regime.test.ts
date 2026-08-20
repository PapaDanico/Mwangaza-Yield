/**
 * A figure we do not have must never read as a passing grade.
 *
 * WHY THIS FILE EXISTS
 *
 * The macro page's headline verdict is a statement about where to put money.
 * It is assembled from tags, and the tags were assembled with `else` branches
 * that fired when a figure was absent as readily as when it was good:
 *
 *     if (debtToGDP !== null && debtToGDP > 70)      -> red
 *     else if (debtToGDP !== null && debtToGDP > 55) -> amber
 *     else                                           -> GREEN, including null
 *
 * Both debt/GDP and the EM spread are null today, because the indicators
 * behind them could not be checked against the sources they were attributed to
 * and were removed. So the page asserted "Debt within threshold" and
 * "Contained spread vs. EM" about numbers nobody has.
 *
 * The tags were the visible half. `conditions` counts green tags, so each
 * absent figure also pushed the verdict toward "Broadly supportive for bond
 * investors". Removing the bad data had made the recommendation *more*
 * confident.
 *
 * This survived a repair pass aimed at precisely this defect — the dashboard
 * cards, the fiscal-health section and the debt chart were all corrected, and
 * this function was missed, because it lived in the page where no test could
 * see it. Hence the extraction to lib/, and hence these tests.
 */
import { describe, it, expect } from 'vitest';
import { macroRegime } from '../../src/lib/macro-regime';

/** Today's real values: CBR 8.75, CPI 6.49, both context figures absent. */
const LIVE = { cbr: 8.75, cpi: 6.49, debt: null, spread: null, sentiment: 'neutral' };

const green = (r: ReturnType<typeof macroRegime>) =>
  r.tags.filter((t) => t.color.includes('mint'));

describe('a missing figure earns no tag', () => {
  it('says nothing about debt when there is no debt figure', () => {
    const r = macroRegime(LIVE.cbr, LIVE.cpi, null, 4.2, LIVE.sentiment);
    const texts = r.tags.map((t) => t.text);
    expect(texts).not.toContain('Debt within threshold');
    expect(texts).not.toContain('Moderate debt pressure');
    expect(texts).not.toContain('Elevated debt burden');
  });

  it('says nothing about the EM spread when there is no spread figure', () => {
    const r = macroRegime(LIVE.cbr, LIVE.cpi, 45, null, LIVE.sentiment);
    const texts = r.tags.map((t) => t.text);
    expect(texts).not.toContain('Contained spread vs. EM');
    expect(texts).not.toContain('Wide spread vs. EM peers');
  });

  it('still judges the figures it does have', () => {
    // Guarding against the opposite overcorrection — dropping a real verdict
    // because a neighbouring figure is missing would be its own defect.
    const r = macroRegime(LIVE.cbr, LIVE.cpi, 75, 5.1, LIVE.sentiment);
    const texts = r.tags.map((t) => t.text);
    expect(texts).toContain('Elevated debt burden');
    expect(texts).toContain('Wide spread vs. EM peers');
  });
});

describe('absence does not tip the headline verdict', () => {
  it('does not call conditions supportive on the strength of missing data', () => {
    // The exact live case. Two absent figures previously contributed two green
    // tags, which alone satisfied `conditions > risks + 1`.
    const r = macroRegime(LIVE.cbr, LIVE.cpi, LIVE.debt, LIVE.spread, LIVE.sentiment);
    expect(r.label).not.toBe('Broadly supportive for bond investors');
    expect(green(r)).toHaveLength(1); // positive real rates, and nothing else
  });

  it('reaches the supportive verdict only when real figures support it', () => {
    // Same rates, but debt and spread now measured and genuinely benign. The
    // verdict is allowed — the objection was never to optimism, only to
    // optimism sourced from absence.
    const r = macroRegime(LIVE.cbr, LIVE.cpi, 40, 2.0, 'dovish');
    expect(r.label).toBe('Broadly supportive for bond investors');
  });

  it('removing a figure never makes the verdict more confident', () => {
    // The property that was violated. Whatever a real figure would have said,
    // deleting it must not upgrade the conclusion.
    const RANK = {
      'Elevated risk environment': 0,
      'Mixed signals — selectivity rewarded': 1,
      'Broadly supportive for bond investors': 2,
    } as const;
    type Verdict = keyof typeof RANK;

    for (const debt of [40, 60, 75]) {
      for (const spread of [2.0, 5.1]) {
        const withFigures = macroRegime(LIVE.cbr, LIVE.cpi, debt, spread, LIVE.sentiment);
        const without = macroRegime(LIVE.cbr, LIVE.cpi, null, null, LIVE.sentiment);
        expect(
          RANK[without.label as Verdict],
          `dropping debt=${debt}, spread=${spread} upgraded the verdict from ` +
            `"${withFigures.label}" to "${without.label}"`
        ).toBeLessThanOrEqual(RANK[withFigures.label as Verdict]);
      }
    }
  });
});

describe('the tags it does emit stay honest', () => {
  it('reports negative real rates as a risk, not an absence', () => {
    const r = macroRegime(5.0, 9.0, null, null, LIVE.sentiment);
    expect(r.tags.map((t) => t.text)).toContain('Negative real rates');
    expect(r.label).toBe('Elevated risk environment');
  });

  it('always returns a label and a description, even with nothing to go on', () => {
    const r = macroRegime(LIVE.cbr, LIVE.cpi, null, null, 'neutral');
    expect(r.label.length).toBeGreaterThan(0);
    expect(r.description.length).toBeGreaterThan(20);
  });
});
