import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertLedgerIntegrity,
  recordPredictions,
  scorePredictions,
  splitIssueCodes,
  summariseLedger,
  type Prediction,
} from '../../src/lib/predictions';
import type { AuctionPrint, AuctionSchedule, Bond } from '../../src/types/bond';

const b = (over: Partial<Bond>): Bond => ({
  isin: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/010',
  name: 'test',
  category: 'FXD',
  issueDate: '2024-06-24',
  maturityDate: '2034-06-12',
  tenorYears: 10,
  couponRate: 14,
  couponFrequencyPerYear: 2,
  ytmGross: 14,
  minInvestmentKES: 50_000,
  taxExempt: false,
  ...over,
});

const p = (over: Partial<AuctionPrint>): AuctionPrint => ({
  id: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/010',
  auctionDate: '2024-06-17',
  weightedAverageRate: 14,
  ...over,
});

const sched = (over: Partial<AuctionSchedule>): AuctionSchedule => ({
  id: 'a1',
  issueCode: 'FXD1/2024/010',
  bondName: 'test',
  category: 'FXD',
  offerOpenDate: '2026-08-01',
  offerCloseDate: '2026-08-18',
  auctionDate: '2026-08-19',
  settlementDate: '2026-08-24',
  amountOfferedKES: 30e9,
  couponRate: null,
  tenorYears: 10,
  prospectusUrl: '',
  status: 'upcoming',
  ...over,
});

// Enough history for a non-thin ten-year distribution.
const HISTORY = Array.from({ length: 8 }, (_, i) =>
  p({ issueCode: `FXD${i}/2024/010`, auctionDate: `2024-0${(i % 8) + 1}-17`, weightedAverageRate: 12 + i })
);
const HISTORY_BONDS = Array.from({ length: 8 }, (_, i) =>
  b({ issueCode: `FXD${i}/2024/010`, isin: `h${i}` })
);

describe('splitIssueCodes', () => {
  it('splits multi-bond and switch auctions into per-bond codes', () => {
    expect(splitIssueCodes('FXD1/2022/10 + FXD1/2021/20 + FXD1/2026/30'))
      .toEqual(['FXD1/2022/10', 'FXD1/2021/20', 'FXD1/2026/30']);
    expect(splitIssueCodes('FXD1/2021/05 → FXD1/2012/20'))
      .toEqual(['FXD1/2021/05', 'FXD1/2012/20']);
  });
  it('yields nothing for a placeholder that names no bond', () => {
    expect(splitIssueCodes('TBA — August 2026')).toEqual([]);
  });
});

describe('recordPredictions', () => {
  it('records a forecast for an upcoming auction, on remaining term for a re-opening', () => {
    // A "10-year" code whose paper has ~8 years left at the auction.
    const reopened = b({ issueCode: 'FXD9/2024/010', isin: 'r', maturityDate: '2034-06-12' });
    const ledger = recordPredictions(
      [], [sched({ issueCode: 'FXD9/2024/010' })], HISTORY, [...HISTORY_BONDS, reopened], '2026-07-26'
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].recordedOn).toBe('2026-07-26');
    expect(ledger[0].targetYears).toBeCloseTo(7.9, 0); // remaining term, not the label's 10
  });

  it('is idempotent: a second daily run adds nothing', () => {
    const auctions = [sched({})];
    const once = recordPredictions([], auctions, HISTORY, HISTORY_BONDS, '2026-07-26');
    const twice = recordPredictions(once, auctions, HISTORY, HISTORY_BONDS, '2026-07-27');
    expect(twice).toEqual(once);
  });

  it('refuses to forecast an auction whose date has passed', () => {
    const ledger = recordPredictions(
      [], [sched({ auctionDate: '2026-07-20' })], HISTORY, HISTORY_BONDS, '2026-07-26'
    );
    expect(ledger).toHaveLength(0);
  });
});

describe('scorePredictions', () => {
  const ledger = recordPredictions([], [sched({})], HISTORY, HISTORY_BONDS, '2026-07-26');

  it('fills in the outcome when a result publishes near the predicted date', () => {
    const result = p({ issueCode: 'FXD1/2024/010', auctionDate: '2026-08-20', weightedAverageRate: 15 });
    const scored = scorePredictions(ledger, [...HISTORY, result], '2026-08-22');
    expect(scored[0].actualRate).toBe(15);
    expect(scored[0].hitRange).toBe(true);       // 12..19 contains 15
    expect(scored[0].hitMiddleHalf).toBe(true);
  });

  it('records a miss as a miss', () => {
    const result = p({ issueCode: 'FXD1/2024/010', auctionDate: '2026-08-19', weightedAverageRate: 25 });
    const scored = scorePredictions(ledger, [...HISTORY, result], '2026-08-22');
    expect(scored[0].hitRange).toBe(false);
  });

  it('ignores a result too far from the predicted date to be the same auction', () => {
    const result = p({ issueCode: 'FXD1/2024/010', auctionDate: '2026-11-19', weightedAverageRate: 15 });
    const scored = scorePredictions(ledger, [...HISTORY, result], '2026-11-22');
    expect(scored[0].scoredOn).toBeUndefined();
  });

  it('never rescores: the first published outcome is final', () => {
    const first = p({ issueCode: 'FXD1/2024/010', auctionDate: '2026-08-19', weightedAverageRate: 15 });
    const scored = scorePredictions(ledger, [...HISTORY, first], '2026-08-22');
    const revised = p({ issueCode: 'FXD1/2024/010', auctionDate: '2026-08-19', weightedAverageRate: 16 });
    const again = scorePredictions(scored, [...HISTORY, revised], '2026-08-25');
    expect(again[0].actualRate).toBe(15);
  });
});

describe('the ledger is append-only, and the check has teeth', () => {
  const ledger = recordPredictions([], [sched({})], HISTORY, HISTORY_BONDS, '2026-07-26');

  it('a normal record-then-score cycle passes', () => {
    const result = p({ issueCode: 'FXD1/2024/010', auctionDate: '2026-08-19', weightedAverageRate: 15 });
    const after = scorePredictions(ledger, [...HISTORY, result], '2026-08-22');
    expect(assertLedgerIntegrity(ledger, after)).toEqual([]);
  });

  it('rewriting a recorded range is a violation', () => {
    const tampered = [{ ...ledger[0], low: ledger[0].low - 1 }];
    expect(assertLedgerIntegrity(ledger, tampered)).not.toEqual([]);
  });

  it('deleting a prediction is a violation', () => {
    expect(assertLedgerIntegrity(ledger, [])).not.toEqual([]);
  });

  it('rewriting a scored outcome is a violation', () => {
    const scored = [{ ...ledger[0], scoredOn: '2026-08-22', actualRate: 15, hitRange: true, hitMiddleHalf: true }];
    const tampered = [{ ...scored[0], actualRate: 14 }];
    expect(assertLedgerIntegrity(scored, tampered)).not.toEqual([]);
  });
});

describe('summariseLedger', () => {
  it('thin predictions are recorded but never counted as claims', () => {
    const thin: Prediction = {
      issueCode: 'X/2026/05', auctionDate: '2026-08-19', recordedOn: '2026-07-26',
      targetYears: 5, toleranceYears: 5, sampleSize: 2, low: 10, p25: 10, median: 11,
      p75: 12, high: 12, thin: true, scoredOn: '2026-08-22', actualRate: 11,
      hitRange: true, hitMiddleHalf: true,
    };
    const s = summariseLedger([thin]);
    expect(s.scored).toBe(1);
    expect(s.claims).toBe(0);
    expect(s.hitRange).toBe(0);
  });
});

describe('the shipped ledger', () => {
  it('parses and is internally append-consistent', () => {
    const shipped = JSON.parse(readFileSync('public/data/predictions.json', 'utf8')) as Prediction[];
    expect(Array.isArray(shipped)).toBe(true);
    expect(assertLedgerIntegrity(shipped, shipped)).toEqual([]);
  });
});
