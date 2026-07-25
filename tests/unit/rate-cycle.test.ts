import { describe, it, expect } from 'vitest';
import { analyseCycle, recentDecisions, describeCycle, whatItMeans } from '../../src/lib/rate-cycle';
import type { RateDecision } from '../../src/types/bond';

const d = (date: string, rate: number, changeBps: number, move: RateDecision['move']): RateDecision => ({
  id: `cbr-${date}`, date, rate, changeBps, move,
  title: `MPC sets CBR at ${rate}`, url: 'https://www.centralbank.go.ke/press/',
});

// Kenya's real recent path, abridged: a peak of 13.00 in early 2024, then
// successive cuts through 2025, then held twice at 8.75.
const EASING: RateDecision[] = [
  d('2024-02-06', 13.0, 50, 'hike'),
  d('2024-08-06', 12.75, -25, 'cut'),
  d('2024-10-08', 12.0, -75, 'cut'),
  d('2024-12-05', 11.25, -75, 'cut'),
  d('2025-02-05', 10.75, -50, 'cut'),
  d('2025-04-08', 10.0, -75, 'cut'),
  d('2025-06-10', 9.75, -25, 'cut'),
  d('2025-08-12', 9.5, -25, 'cut'),
  d('2025-10-07', 9.25, -25, 'cut'),
  d('2026-02-03', 8.75, -50, 'cut'),
  d('2026-04-07', 8.75, 0, 'hold'),
  d('2026-06-09', 8.75, 0, 'hold'),
];

describe('analyseCycle', () => {
  it('returns null with no decisions rather than inventing a cycle', () => {
    expect(analyseCycle([])).toBeNull();
  });

  it('reads the current rate from the newest decision', () => {
    const c = analyseCycle(EASING)!;
    expect(c.current).toBe(8.75);
    expect(c.currentDate).toBe('2026-06-09');
  });

  it('records the all-time high and low across the whole history', () => {
    const c = analyseCycle(EASING)!;
    expect(c.recordHigh).toBe(13.0);
    expect(c.recordHighDate).toBe('2024-02-06');
    expect(c.recordLow).toBe(8.75);
  });

  it('anchors the cycle to where the current run began, not the record high', () => {
    // Kenya's record CBR is 18.00% (Dec 2011). Measuring today's 8.75%
    // against that would describe a single easing spanning three cycles and
    // fifteen years. The honest anchor is the level this run started from.
    const withOldPeak = [d('2011-12-01', 18.0, 550, 'hike'), d('2012-07-01', 13.0, -500, 'cut'), ...EASING];
    const c = analyseCycle(withOldPeak)!;
    expect(c.recordHigh).toBe(18.0);
    expect(c.cycleStart).toBe(13.0);
    expect(c.cycleStartDate).toBe('2024-02-06');
    // The run total equals the move from the cycle start, by construction.
    expect(c.runBps).toBe(Math.round((c.current - c.cycleStart) * 100));
  });

  it('ignores holds when finding the last actual move', () => {
    const c = analyseCycle(EASING)!;
    expect(c.lastChange?.date).toBe('2026-02-03');
    expect(c.holdsSince).toBe(2);
  });

  it('counts the run of same-direction moves and their total', () => {
    const c = analyseCycle(EASING)!;
    // Nine cuts from 12.75 down to 8.75; the 2024-02 hike stops the count.
    expect(c.runLength).toBe(9);
    expect(c.runBps).toBe(-425);
  });

  it('treats a pause as part of the same cycle, not a new one', () => {
    // A hold in the middle must not break a run of cuts.
    const paused = [
      d('2025-01-01', 10.0, -50, 'cut'),
      d('2025-03-01', 10.0, 0, 'hold'),
      d('2025-05-01', 9.5, -50, 'cut'),
    ];
    expect(analyseCycle(paused)!.runLength).toBe(2);
  });

  it('stops a run at a move in the opposite direction', () => {
    const reversed = [
      d('2025-01-01', 9.0, -50, 'cut'),
      d('2025-03-01', 9.5, 50, 'hike'),
      d('2025-05-01', 10.0, 50, 'hike'),
    ];
    const c = analyseCycle(reversed)!;
    expect(c.runLength).toBe(2);
    expect(c.phase).toBe('tightening');
  });

  it('calls two or more meetings without a move a hold, not an easing cycle', () => {
    expect(analyseCycle(EASING)!.phase).toBe('holding');
  });

  it('still reads as easing after a single hold', () => {
    const c = analyseCycle(EASING.slice(0, -1))!;
    expect(c.holdsSince).toBe(1);
    expect(c.phase).toBe('easing');
  });

  it('is order-independent — unsorted input gives the same answer', () => {
    const shuffled = [...EASING].reverse();
    expect(analyseCycle(shuffled)).toEqual(analyseCycle(EASING));
  });
});

describe('recentDecisions', () => {
  it('windows relative to the newest decision, not today', () => {
    // Anchoring on today would empty the chart whenever data lags.
    const window = recentDecisions(EASING, 1);
    expect(window[window.length - 1].date).toBe('2026-06-09');
    expect(window.some((x) => x.date === '2024-02-06')).toBe(false);
  });

  it('keeps one earlier point so the first segment has a starting level', () => {
    const window = recentDecisions(EASING, 1);
    // 2025-06-10 is the first decision inside the window; 2025-04-08 is the
    // one before it, carried in so the line starts at a real level rather
    // than appearing to begin at 9.75.
    expect(window[1].date).toBe('2025-06-10');
    expect(window[0].date).toBe('2025-04-08');
  });

  it('returns nothing for an empty history', () => {
    expect(recentDecisions([], 5)).toEqual([]);
  });
});

describe('describeCycle', () => {
  it('states the hold, the run behind it, and the peak', () => {
    const text = describeCycle(analyseCycle(EASING)!);
    expect(text).toContain('held at 8.75%');
    expect(text).toContain('2 meetings');
    expect(text).toContain('9 consecutive cuts');
    expect(text).toContain('4.25 percentage points');
    // 13.00% is the level the run started FROM, not its first cut.
    expect(text).toContain('from 13.00% in February 2024');
  });

  it('never compares today against a peak from an earlier cycle', () => {
    const withOldPeak = [d('2011-12-01', 18.0, 550, 'hike'), d('2012-07-01', 13.0, -500, 'cut'), ...EASING];
    expect(describeCycle(analyseCycle(withOldPeak)!)).not.toContain('18');
  });

  it('does not claim a run when there has never been a move', () => {
    const text = describeCycle(analyseCycle([d('2026-01-01', 8.75, 0, 'start')])!);
    expect(text).toBe('The Central Bank Rate stands at 8.75%.');
  });
});

describe('whatItMeans', () => {
  it('explains the mechanism without recommending an action', () => {
    for (const set of [EASING, EASING.slice(0, -2), [d('2025-01-01', 9.0, 50, 'hike')]]) {
      const text = whatItMeans(analyseCycle(set)!);
      expect(text.length).toBeGreaterThan(40);
      expect(text).not.toMatch(/\byou should\b|\bwe recommend\b|\bbuy now\b/i);
    }
  });
});
