import { describe, it, expect } from 'vitest';
import {
  indicatorAge, indicatorStaleNote, INDICATOR_BUDGETS, DEFAULT_BUDGET_DAYS,
} from '../../src/lib/indicator-freshness';

const NOW = new Date('2026-08-06T12:00:00Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe('indicatorAge', () => {
  it('calls an 18-day-old exchange rate stale — THE SHIPPED BUG', () => {
    // macro.json held FX_USD_KES at 2026-07-20 while CPI was a day old, and
    // every surface rendered them identically.
    const a = indicatorAge('FX_USD_KES', '2026-07-20', NOW)!;
    expect(a.days).toBe(17);
    expect(a.stale).toBe(true);
  });

  it('does NOT call a two-month-old CBR stale', () => {
    // The MPC meeting and holding rates is not a data fault, and warning about
    // it would be the wolf-cry that teaches readers to ignore the warning.
    const a = indicatorAge('CBR', daysAgo(58), NOW)!;
    expect(a.stale).toBe(false);
  });

  it('does not call a three-week-old CPI stale', () => {
    expect(indicatorAge('CPI', daysAgo(21), NOW)!.stale).toBe(false);
  });

  it('lets FX pass over a weekend', () => {
    expect(indicatorAge('FX_USD_KES', daysAgo(3), NOW)!.stale).toBe(false);
  });

  it('is stale strictly ABOVE the budget, not at it', () => {
    const b = INDICATOR_BUDGETS.FX_USD_KES.days;
    expect(indicatorAge('FX_USD_KES', daysAgo(b), NOW)!.stale).toBe(false);
    expect(indicatorAge('FX_USD_KES', daysAgo(b + 1), NOW)!.stale).toBe(true);
  });

  it('gives an unlisted indicator the conservative default, not exemption', () => {
    const a = indicatorAge('GDP', daysAgo(DEFAULT_BUDGET_DAYS + 5), NOW)!;
    expect(a.budgetDays).toBe(DEFAULT_BUDGET_DAYS);
    expect(a.stale).toBe(true);
  });

  it('clamps a future date to zero rather than reporting a negative age', () => {
    // A device with a skewed clock should not be shown nonsense.
    const a = indicatorAge('CPI', '2026-12-25', NOW)!;
    expect(a.days).toBe(0);
    expect(a.stale).toBe(false);
  });

  it('returns null for an unreadable date instead of guessing', () => {
    expect(indicatorAge('CPI', 'not-a-date', NOW)).toBeNull();
  });
});

describe('indicatorStaleNote', () => {
  it('says nothing about a current figure', () => {
    expect(indicatorStaleNote(indicatorAge('CPI', daysAgo(2), NOW))).toBeNull();
  });

  it('says nothing when the age could not be read', () => {
    expect(indicatorStaleNote(null)).toBeNull();
  });

  it('gives the reader the age AND the expected cadence, not a bare warning', () => {
    const note = indicatorStaleNote(indicatorAge('FX_USD_KES', '2026-07-20', NOW))!;
    expect(note).toContain('17 days old');
    // Without the cadence the reader cannot judge whether 17 days is bad.
    expect(note).toContain('every trading day');
  });
});
