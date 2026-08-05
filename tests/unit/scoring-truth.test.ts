import { describe, it, expect } from 'vitest';
import { scorePredictions, type Prediction } from '../../src/lib/predictions';
import { backtest } from '../../src/lib/backtest';
import { auctionKind } from '../../src/lib/auction-history';
import { readFileSync } from 'node:fs';
import type { AuctionPrint, Bond } from '../../src/types/bond';

/**
 * What is allowed to count as "what the auction actually paid".
 *
 * The ledger's whole claim is that a range recorded beforehand contained the
 * rate CBK published. That makes the SELECTION of the rate load-bearing: pick
 * the wrong print and a hit becomes a miss, or worse, a miss becomes a hit,
 * and the public number is wrong in a way no reader can detect.
 *
 * Two selection defects lived here and the 830-test suite passed throughout,
 * because nothing tested selection at all — only the comparison once a rate
 * had been chosen. Both are reproduced below from real archive cases.
 */

const print = (
  issueCode: string,
  auctionDate: string,
  rate: number,
  sourceUrl = 'https://www.centralbank.go.ke/1234_BOND-RESULTS.pdf'
): AuctionPrint =>
  ({ issueCode, auctionDate, weightedAverageRate: rate, sourceUrl }) as AuctionPrint;

const forecast = (over: Partial<Prediction> = {}): Prediction => ({
  issueCode: 'FXD1/2021/020',
  auctionDate: '2026-05-25',
  recordedOn: '2026-05-13',
  targetYears: 15,
  toleranceYears: 1.5,
  windowDays: null,
  sampleSize: 9,
  low: 13.0,
  p25: 13.5,
  median: 13.7,
  p75: 13.9,
  high: 14.5,
  thin: false,
  ...over,
});

describe('only an issuance can grade an issuance forecast', () => {
  /**
   * The real case: FXD1/2021/020's 2026-05-25 auction, with a switch printed
   * five days earlier. `clearingRate` nulls buybacks and nothing else, so the
   * switch arrived carrying 13.412 and won the sort by being earlier.
   */
  it('ignores a switch printed days before the auction it forecast', () => {
    const prints = [
      print('FXD1/2021/020', '2026-05-20', 13.412, 'https://www.centralbank.go.ke/9_SWITCH-RESULTS.pdf'),
      print('FXD1/2021/020', '2026-05-25', 13.742),
    ];
    const [scored] = scorePredictions([forecast()], prints, '2026-06-01');
    expect(scored.actualRate).toBe(13.742);
  });

  it('ignores a tap sale, which is priced rather than bid', () => {
    const prints = [
      print('FXD1/2021/020', '2026-05-21', 13.2, 'https://www.centralbank.go.ke/77_TAP SALE RESULTS.pdf'),
      print('FXD1/2021/020', '2026-05-25', 13.742),
    ];
    const [scored] = scorePredictions([forecast()], prints, '2026-06-01');
    expect(scored.actualRate).toBe(13.742);
  });

  it('leaves the prediction unscored when only a tap exists', () => {
    // Better to say nothing than to grade against the wrong kind of event.
    const prints = [
      print('FXD1/2021/020', '2026-05-25', 13.2, 'https://www.centralbank.go.ke/77_TAPSALE RESULTS.pdf'),
    ];
    const [scored] = scorePredictions([forecast()], prints, '2026-06-01');
    expect(scored.scoredOn).toBeUndefined();
    expect(scored.actualRate).toBeUndefined();
  });
});

describe('the nearest print wins, not the earliest', () => {
  /**
   * The selection sorted ascending by date and took the first print inside the
   * ±14-day window, which is the PREVIOUS auction of the same bond whenever
   * the forecast was recorded more than a fortnight ahead.
   *
   * This is live, not historical: two of the five standing predictions were
   * recorded on 2026-07-31 for auctions on 2026-08-24 — a 24-day lead, inside
   * the range where it fires.
   */
  it('does not grade a 24-day-ahead forecast against the prior auction', () => {
    const p = forecast({ recordedOn: '2026-07-31', auctionDate: '2026-08-24' });
    const prints = [
      print('FXD1/2021/020', '2026-08-10', 10.701), // the previous auction
      print('FXD1/2021/020', '2026-08-24', 10.328), // the one forecast
    ];
    const [scored] = scorePredictions([p], prints, '2026-09-01');
    expect(scored.actualRate).toBe(10.328);
  });

  it('still tolerates CBK printing a result a few days late', () => {
    // The ±14-day window exists because the calendar date and the result date
    // differ; narrowing to an exact match would break real scoring.
    const p = forecast({ recordedOn: '2026-07-31', auctionDate: '2026-08-24' });
    const prints = [print('FXD1/2021/020', '2026-08-27', 11.5)];
    const [scored] = scorePredictions([p], prints, '2026-09-01');
    expect(scored.actualRate).toBe(11.5);
  });
});

describe('the backtest replays competitive auctions only', () => {
  /**
   * The published hit rate included 71 taps and switches out of 317
   * rate-bearing prints. A tap is sold at a fixed price close to the recent
   * market, so it is unusually easy to "forecast" — which is exactly why
   * including it flattered the number.
   */
  /* Run against the SHIPPED archive rather than a synthetic one.
   *
   * The first version of these two tests built a 40-print fixture and asserted
   * the tap's date was absent from the results. Both passed — against the
   * unfixed code as well, which is what gave them away. `backtest` returned
   * ZERO rows for that fixture (it needs 20 prior prints AND a non-empty
   * comparable set from bidGuidance), so `not.toContain` was asking whether a
   * date appeared in an empty list. A test that cannot fail is worse than no
   * test: it reports coverage it does not have.
   *
   * The archive is the real input and holds 65 taps and 6 switches, so the
   * assertion has something to bite on — and `expect(rows.length)` guards the
   * vacuity directly rather than trusting that it cannot recur. */
  const prints: AuctionPrint[] = JSON.parse(
    readFileSync('public/data/auction-results.json', 'utf8')
  );
  const bonds: Bond[] = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));
  const rows = backtest(prints, bonds);

  it('replays a meaningful number of auctions at all', () => {
    // Without this, every assertion below passes on an empty result set.
    expect(rows.length).toBeGreaterThan(50);
  });

  it('scores no tap sale and no switch', () => {
    const scoredKeys = new Set(rows.map((r) => `${r.issueCode}|${r.auctionDate}`));
    const wrongKind = prints.filter(
      (p) => auctionKind(p) !== 'issuance' && scoredKeys.has(`${p.issueCode}|${p.auctionDate}`)
    );
    expect(wrongKind.map((p) => `${p.issueCode} ${p.auctionDate} ${auctionKind(p)}`)).toEqual([]);
  });

  it('has a real archive to test against — taps and switches are present in it', () => {
    // If CBK's filenames ever stop being classifiable, the test above would go
    // quiet rather than fail. This is what notices.
    const nonIssuance = prints.filter((p) => auctionKind(p) !== 'issuance');
    expect(nonIssuance.length).toBeGreaterThan(20);
  });
});
