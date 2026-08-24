import { describe, it, expect } from 'vitest';
import {
  indicatorAge, indicatorStaleNote, INDICATOR_BUDGETS, DEFAULT_BUDGET_DAYS, tradingDaysElapsed,
  vintageLabel,
} from '../../src/lib/indicator-freshness';

const NOW = new Date('2026-08-06T12:00:00Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe('indicatorAge', () => {
  it('calls an 18-day-old exchange rate stale — THE SHIPPED BUG', () => {
    // macro.json held FX_USD_KES at 2026-07-20 while CPI was a day old, and
    // every surface rendered them identically.
    const a = indicatorAge('FX_USD_KES', '2026-07-20', NOW)!;
    expect(a.days).toBe(13);
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

  it('does not count a weekend as missed FX publications', () => {
    const sunday = new Date('2026-08-24T06:00:00Z');
    const a = indicatorAge('FX_USD_KES', '2026-08-19', sunday)!;
    expect(a.days).toBe(3);
    expect(a.stale).toBe(false);
    expect(tradingDaysElapsed(new Date('2026-08-19T00:00:00Z'), sunday)).toBe(3);
  });

  it('is stale strictly ABOVE the budget, not at it', () => {
    const b = INDICATOR_BUDGETS.FX_USD_KES.days;
    // Fri 31 July to Thu 6 August crosses exactly four CBK publication days;
    // Thursday 30 July crosses five.
    expect(indicatorAge('FX_USD_KES', '2026-07-31', NOW)!.days).toBe(b);
    expect(indicatorAge('FX_USD_KES', '2026-07-31', NOW)!.stale).toBe(false);
    expect(indicatorAge('FX_USD_KES', '2026-07-30', NOW)!.days).toBe(b + 1);
    expect(indicatorAge('FX_USD_KES', '2026-07-30', NOW)!.stale).toBe(true);
  });

  it('gives an unlisted indicator the conservative default, not exemption', () => {
    const a = indicatorAge('UNKNOWN_INDICATOR', daysAgo(DEFAULT_BUDGET_DAYS + 5), NOW)!;
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

describe('vintageLabel', () => {
  it('names the MONTH a CPI print describes, not the day we read it', () => {
    // THE SHIPPED BUG. macro.json dated July's 6.49 to 2026-08-05, and CBK's
    // own table row is ['2026','July','5.08','6.49'].
    expect(vintageLabel('2026-08-05', '2026-07')).toBe('July 2026');
  });

  it('falls back to the date when there is no period', () => {
    // A daily rate has no separate reference month, and inventing one would be
    // worse than the problem being fixed.
    expect(vintageLabel('2026-07-20')).toBe('2026-07-20');
    expect(vintageLabel('2026-07-20', undefined)).toBe('2026-07-20');
  });

  it('falls back rather than guessing at a malformed period', () => {
    for (const bad of ['2026', '2026-7', 'July', '', '2026-13', '2026-00']) {
      expect(vintageLabel('2026-08-05', bad), `accepted ${JSON.stringify(bad)}`)
        .toBe('2026-08-05');
    }
  });

  it('handles both ends of the year', () => {
    expect(vintageLabel('x', '2026-01')).toBe('January 2026');
    expect(vintageLabel('x', '2026-12')).toBe('December 2026');
  });

  it('never renders a month number where a name belongs', () => {
    // The off-by-one that a NAMES lookup invites.
    expect(vintageLabel('x', '2026-02')).toBe('February 2026');
    expect(vintageLabel('x', '2026-02')).not.toMatch(/\d{4}-/);
  });
});
