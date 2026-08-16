/**
 * The record of what Treasury bills actually paid a saver, after tax and after
 * prices.
 *
 * THE ANCHOR TEST IS THE IMPORTANT ONE
 * ------------------------------------
 * The first draft of `real-history.ts` computed the net yield itself, as
 * `gross * 0.85`. That reads as obviously right and is wrong: withholding falls
 * on the INTEREST, so the yield has to be recomputed from what is actually
 * received. It gave 7.72% on today's 91-day bill where every other surface on
 * the site shows 7.68% — four basis points too generous, repeating on every
 * reading in a decade-long history, always in the same direction.
 *
 * So the first test below pins this module to the figures the shipped app
 * already displays. If `computeTBill` and this module ever disagree, one of
 * them is lying to a reader, and the test says which numbers were true when it
 * was written.
 */
import { describe, it, expect } from 'vitest';
import {
  realHistory,
  realRecord,
  MAX_CPI_GAP_DAYS,
  type CpiPoint,
  type RatePoint,
} from '../../src/lib/real-history';

/** July 2026's print, as public/data/cpi-history.json holds it. */
const CPI: CpiPoint[] = [
  { date: '2026-07-01', value: 6.49 },
  { date: '2026-06-01', value: 6.41 },
  { date: '2011-09-01', value: 17.32 },
];

describe('realHistory', () => {
  it('agrees with the figures the site already shows', () => {
    // 91-day at 8.7882% is the live auction as of 2026-08-16, and /tbills/
    // renders 7.68% net against a 6.49% CPI leaving 1.12% real.
    const [r] = realHistory(
      [{ date: '2026-07-30', discountRate: 8.7882, tenorDays: 91 }],
      CPI
    );
    expect(r.grossPct).toBeCloseTo(9.08, 1);
    expect(r.netPct).toBeCloseTo(7.68, 1);
    expect(r.realPct).toBeCloseTo(1.12, 1);
  });

  it('uses Fisher rather than subtraction', () => {
    // Subtracting gives 7.68 - 6.49 = 1.19. The honest figure is 1.12. The
    // difference is small, always in the flattering direction, and repeats on
    // every reading — which is exactly how a bias becomes a story.
    const [r] = realHistory(
      [{ date: '2026-07-30', discountRate: 8.7882, tenorDays: 91 }],
      CPI
    );
    expect(r.realPct).toBeLessThan(7.68 - 6.49);
  });

  it('pairs an auction with the print in force THEN, not the newest one', () => {
    // Matching every auction to the latest CPI would rewrite the whole history
    // every month, and would show 2011's savers earning today's real return.
    const [r] = realHistory(
      [{ date: '2011-09-15', discountRate: 12.0, tenorDays: 91 }],
      CPI
    );
    expect(r.inflationAsOf).toBe('2011-09-01');
    expect(r.inflationPct).toBe(17.32);
    // 12% gross, taxed, against 17.32% inflation is a real loss.
    expect(r.realPct).toBeLessThan(0);
  });

  it('drops a reading it cannot honestly pair', () => {
    // A gap wider than a monthly cycle means one series has a hole. Reaching
    // across it would invent a real return nobody experienced.
    const far = realHistory(
      [{ date: '2026-07-30', discountRate: 8.7882, tenorDays: 91 }],
      [{ date: '2026-01-01', value: 5 }]
    );
    expect(far).toEqual([]);
    expect(MAX_CPI_GAP_DAYS).toBe(45);
  });

  it('refuses a print published after the auction', () => {
    const future = realHistory(
      [{ date: '2026-01-15', discountRate: 9, tenorDays: 91 }],
      [{ date: '2026-07-01', value: 6.49 }]
    );
    expect(future).toEqual([]);
  });
});

describe('realRecord', () => {
  const readings = realHistory(
    [
      { date: '2011-09-15', discountRate: 12.0, tenorDays: 91 },  // real loss
      { date: '2026-06-15', discountRate: 8.9, tenorDays: 91 },   // real gain
      { date: '2026-07-30', discountRate: 8.7882, tenorDays: 91 }, // real gain
    ],
    CPI
  );

  it('counts how often savers actually lost to inflation', () => {
    const rec = realRecord(readings);
    expect(rec.readings).toBe(3);
    expect(rec.losingReadings).toBe(1);
    expect(rec.losingShare).toBeCloseTo(1 / 3, 2);
  });

  it('names the worst and best readings, so the claim can be checked', () => {
    const rec = realRecord(readings);
    expect(rec.worst?.date).toBe('2011-09-15');
    expect(rec.best?.realPct).toBeGreaterThan(0);
  });

  it('reports the median, not the mean', () => {
    // One hyperinflationary month would drag an average into a figure no saver
    // experienced. This describes the typical auction.
    const rec = realRecord(readings);
    const mean = readings.reduce((a, r) => a + r.realPct, 0) / readings.length;
    expect(rec.medianRealPct).not.toBeCloseTo(mean, 3);
  });

  it('says nothing rather than zero when there are no readings', () => {
    const rec = realRecord([]);
    expect(rec.readings).toBe(0);
    expect(rec.worst).toBeNull();
    expect(rec.best).toBeNull();
  });
});
