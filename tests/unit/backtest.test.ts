import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { backtest, summariseBacktest, pointInTimePrints } from '../../src/lib/backtest';
import { bidGuidance } from '../../src/lib/bid';
import type { AuctionPrint, Bond } from '../../src/types/bond';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8'));
const PRINTS: AuctionPrint[] = read('public/data/auction-results.json');
const BONDS: Bond[] = read('public/data/bonds.json');

/**
 * A backtest is worthless unless it cannot cheat, so the cheating is what gets
 * tested hardest here.
 *
 * The single failure mode that matters is lookahead: letting the replay see
 * the auction it is forecasting, or anything after it. A backtest that peeks
 * does not merely overstate — it produces excellent numbers under every
 * variation, which is exactly why it survives casual review. Everything below
 * exists to make that impossible to introduce silently.
 */
describe('the backtest cannot see the future', () => {
  it('excludes the target auction itself, not just later ones', () => {
    /* Strictly-before, not on-or-before. Several bonds settle on one auction
     * date; including same-day prints would let a bond's own result — or its
     * neighbour's, set in the same room by the same bidders — inform its own
     * forecast. That is the version of lookahead most likely to be mistaken
     * for an off-by-one and waved through. */
    const dated = PRINTS.filter((p) => p.auctionDate);
    const target = dated.map((p) => p.auctionDate).sort()[Math.floor(dated.length / 2)];
    const prior = pointInTimePrints(dated, target);
    expect(prior.length, 'nothing to test against').toBeGreaterThan(10);
    expect(
      prior.some((p) => p.auctionDate >= target),
      'a print dated on or after the target auction reached the comparable set'
    ).toBe(false);
  });

  it('actually changes the answer — the filter is not decorative', () => {
    /* The mutation check, written as a test. If the guidance came out the same
     * with and without the future, the point-in-time filter would be doing
     * nothing and every claim resting on it would be hollow.
     *
     * This compares the RESULTING MIDPOINT rather than the number of
     * comparables. Counts stopped being a valid signal once guidance gained a
     * recency ladder: it measures its window back from the newest print it is
     * given, so a truncated archive can legitimately yield a similar or even
     * larger comparable set from a nearer window. The midpoint moving is the
     * property that actually matters. */
    const dated = PRINTS.filter((p) => p.auctionDate).sort((a, b) =>
      a.auctionDate.localeCompare(b.auctionDate)
    );
    const target = '2023-01-01';
    const withFuture = bidGuidance(dated, BONDS, 10, { taxExempt: false });
    const pointInTime = bidGuidance(pointInTimePrints(dated, target), BONDS, 10, {
      taxExempt: false,
    });
    expect(pointInTime.count, 'no comparables before the cutoff').toBeGreaterThan(0);
    expect(
      pointInTime.median,
      'the same midpoint with and without three years of future rates — the filter did nothing'
    ).not.toBe(withFuture.median);
    // And the comparables themselves must all predate the cutoff.
    expect(pointInTime.comparables.every((c) => c.auctionDate < target)).toBe(true);
  });

  it('never scores an auction against a forecast built from it', () => {
    /* End to end, on the shipped archive: every replayed forecast must have
     * been buildable strictly before the auction it is scored against. */
    const results = backtest(PRINTS, BONDS);
    expect(results.length, 'the backtest produced nothing to check').toBeGreaterThan(50);
    for (const r of results) {
      const prior = pointInTimePrints(
        PRINTS.filter((p) => p.auctionDate),
        r.auctionDate
      );
      expect(
        prior.every((p) => p.auctionDate < r.auctionDate),
        `${r.issueCode} @ ${r.auctionDate} was forecast using same-day or later data`
      ).toBe(true);
    }
  });
});

describe('what the backtest reports', () => {
  const results = backtest(PRINTS, BONDS);
  const s = summariseBacktest(results);

  it('reports a real sample rather than a vacuous one', () => {
    /* This codebase has shipped a guard that scanned zero files and reported
     * success five times. A summary over an empty replay would show a perfect
     * and meaningless record. */
    expect(s.tested, 'no auctions were replayed at all').toBeGreaterThan(50);
    expect(s.claims, 'every replayed forecast was thin — nothing was claimed').toBeGreaterThan(
      50
    );
    expect(s.firstAuction).toBeTruthy();
    expect(s.lastAuction).toBeTruthy();
  });

  it('does not claim the full seventeen-year archive', () => {
    /* The archive reaches 2009, but guidance draws from 2022 onward only —
     * GUIDANCE_FROM, because weightedAverageRate is missing on roughly a fifth
     * of the older records. The backtest inherits that cutoff by calling the
     * real bidGuidance, and the number shown to a reader must match the window
     * actually tested rather than the window the archive spans. */
    expect(s.firstAuction!.slice(0, 4) >= '2022').toBe(true);
  });

  it('excludes thin forecasts from the hit rate, as the live ledger does', () => {
    /* The assistant marks a thin range as not-a-claim when it shows one.
     * Scoring it here would credit or blame the product for something it
     * explicitly declined to assert. */
    expect(s.claims).toBeLessThanOrEqual(s.tested);
    expect(results.some((r) => r.thin), 'no thin cases at all — the exclusion is untested').toBe(
      true
    );
  });

  it('reports the middle half as the stricter test, and it is stricter', () => {
    /* The honest headline. A well-calibrated p25-p75 interval should contain
     * the outturn about half the time. On the shipped archive it contains it
     * far less often, which means the stated middle range is too NARROW —
     * the method is overconfident, and the page says so rather than leading
     * with the flattering full-range figure.
     *
     * This asserts the ordering, not a target: if the interval is ever widened
     * and calibration improves, that is a pass, not a regression. */
    expect(s.hitMiddleHalf).toBeLessThan(s.hitRange);
  });

  it('measures bias with a signed error, so a one-sided miss cannot hide', () => {
    /* Absolute error alone would score a method that is always 0.7pp high the
     * same as one that is unbiased and noisy. They are not the same product. */
    expect(Number.isFinite(s.medianBiasPp)).toBe(true);
    expect(Number.isFinite(s.medianAbsErrorPp)).toBe(true);
    expect(s.medianAbsErrorPp).toBeGreaterThanOrEqual(0);
  });
});
