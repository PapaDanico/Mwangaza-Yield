import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  calibratedBand,
  empiricalCoverage,
  MIN_CALIBRATION_SAMPLE,
} from '../../src/lib/calibration';
import { backtest } from '../../src/lib/backtest';
import type { AuctionPrint, Bond } from '../../src/types/bond';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8'));
const PRINTS: AuctionPrint[] = read('public/data/auction-results.json');
const BONDS: Bond[] = read('public/data/bonds.json');

/**
 * The band has to be honest about its own width, which is the one property a
 * prediction interval can be checked on without waiting for the future.
 *
 * The interval this replaces claimed a middle half and delivered 21%. The
 * whole point of calibrating on past errors is that the claimed coverage and
 * the achieved coverage are the same quantity by construction — so the tests
 * check exactly that, and check that the construction cannot see the future.
 */
describe('a band calibrated on past errors', () => {
  it('contains the share of past errors it claims to', () => {
    /* By construction, not by luck: the 80% half-width is the 80th percentile
     * of the errors it was built from. If this drifts, the quantile is wrong. */
    const errors = Array.from({ length: 200 }, (_, i) => i / 100);
    for (const coverage of [0.5, 0.8, 0.9]) {
      const b = calibratedBand(10, errors, coverage)!;
      const got = empiricalCoverage(errors, b.halfWidth).share;
      expect(Math.abs(got - coverage), `claimed ${coverage}, achieved ${got}`).toBeLessThan(0.02);
    }
  });

  it('is wider for more coverage, never narrower', () => {
    const errors = Array.from({ length: 100 }, (_, i) => i / 50);
    const half = calibratedBand(10, errors, 0.5)!;
    const most = calibratedBand(10, errors, 0.9)!;
    expect(most.halfWidth).toBeGreaterThan(half.halfWidth);
    expect(most.low).toBeLessThan(half.low);
    expect(most.high).toBeGreaterThan(half.high);
  });

  it('refuses to quote a band from too few errors', () => {
    /* An 80th percentile of twelve numbers moves violently with one addition.
     * A band nobody should trust is worse than no band, because the reader
     * cannot tell the two apart. */
    const few = Array.from({ length: MIN_CALIBRATION_SAMPLE - 1 }, () => 0.5);
    expect(calibratedBand(10, few)).toBeNull();
    const enough = Array.from({ length: MIN_CALIBRATION_SAMPLE }, () => 0.5);
    expect(calibratedBand(10, enough)).not.toBeNull();
  });

  it('rejects garbage rather than producing a confident band', () => {
    const errors = Array.from({ length: 50 }, () => 0.4);
    expect(calibratedBand(Number.NaN, errors)).toBeNull();
    const withJunk = [...errors, Number.NaN, Number.POSITIVE_INFINITY, -3];
    const b = calibratedBand(10, withJunk)!;
    expect(Number.isFinite(b.halfWidth)).toBe(true);
    expect(b.sampleSize, 'junk values were counted in the sample').toBe(errors.length);
  });

  it('beats the interval it replaces, walked forward on the real archive', () => {
    /* THE CLAIM THAT JUSTIFIES THE MODULE, checked against shipped data.
     *
     * Calibration uses only errors from auctions that had already resolved
     * when each forecast was made — the same no-lookahead discipline as the
     * backtest, because a band tuned on its own test set validates beautifully
     * and fails in production. */
    const results = backtest(PRINTS, BONDS).filter((r) => !r.thin);
    expect(results.length).toBeGreaterThan(50);

    const seen: number[] = [];
    let bandCovered = 0;
    let bandTotal = 0;
    let quartileCovered = 0;

    for (const r of results) {
      if (seen.length >= MIN_CALIBRATION_SAMPLE) {
        const b = calibratedBand(r.median, seen, 0.8)!;
        bandTotal++;
        if (r.actualRate >= b.low && r.actualRate <= b.high) bandCovered++;
        if (r.hitMiddleHalf) quartileCovered++;
      }
      seen.push(Math.abs(r.errorPp));
    }

    expect(bandTotal, 'nothing was evaluated out of sample').toBeGreaterThan(30);
    const bandShare = bandCovered / bandTotal;
    const quartileShare = quartileCovered / bandTotal;

    /* The 80% band must actually land near 80%, and must beat the quartile
     * interval it replaces. Bounds are loose because this is empirical
     * coverage on a drifting series, not a guarantee. */
    expect(bandShare, `80% band covered ${(bandShare * 100).toFixed(1)}%`).toBeGreaterThan(0.7);
    expect(bandShare).toBeLessThan(0.95);
    expect(
      bandShare,
      'the calibrated band is no better than the quartiles it replaces'
    ).toBeGreaterThan(quartileShare);
  });

  it('does not pretend the coverage is guaranteed', () => {
    /* Conformal guarantees assume exchangeability; a rate series violates it.
     * empiricalCoverage exists so the page quotes what HAPPENED rather than
     * what the method promises. */
    const errors = [0.1, 0.2, 5.0];
    const c = empiricalCoverage(errors, 0.3);
    expect(c.covered).toBe(2);
    expect(c.total).toBe(3);
    expect(c.share).toBeCloseTo(2 / 3, 6);
  });
});
