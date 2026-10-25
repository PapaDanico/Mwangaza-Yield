import { describe, expect, it } from 'vitest';
import { groupDecisions } from '../../src/lib/rate-cycle';
import history from '../../public/data/cbr-history.json';
import type { RateDecision } from '../../src/types/bond';

const d = (date: string, rate: number, move: RateDecision['move']): RateDecision =>
  ({ id: date, date, rate, move, title: '', url: '', changeBps: 0 });

describe('groupDecisions', () => {
  it('collapses a run of holds at one rate into one row, newest first', () => {
    const rows = groupDecisions([
      d('2026-02-01', 8.75, 'cut'), d('2026-04-01', 8.75, 'hold'),
      d('2026-06-01', 8.75, 'hold'), d('2026-08-01', 8.75, 'hold'), d('2025-12-01', 9, 'cut'),
    ]);
    expect(rows.map((r) => [r.latest.date, r.meetings, r.since])).toEqual([
      ['2026-08-01', 3, '2026-04-01'],
      ['2026-02-01', 1, '2026-02-01'],
      ['2025-12-01', 1, '2025-12-01'],
    ]);
  });

  it('never shows the same hold twice on the shipped history', () => {
    const rows = groupDecisions(history as RateDecision[]);
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].latest, b = rows[i].latest;
      expect(a.move === 'hold' && b.move === 'hold' && a.rate === b.rate).toBe(false);
    }
  });
});
