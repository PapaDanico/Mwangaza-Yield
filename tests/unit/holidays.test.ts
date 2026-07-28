import { describe, it, expect } from 'vitest';
import {
  EID_IS_GAZETTED,
  holidayOn,
  holidaysInYear,
  isBusinessDay,
  paymentDay,
} from '../../src/lib/holidays';

/**
 * A coupon date is a schedule, not a payment.
 *
 * Kenyan bonds pay in exact 182-day steps from issue, so the date lands on
 * whatever weekday the arithmetic produces — two in seven on a weekend, and a
 * few each year on a public holiday. The planners quoted the scheduled date,
 * which for somebody timing a school fee against a coupon is the wrong answer
 * by a day or three.
 */
describe('the Kenyan holiday calendar', () => {
  it('knows the fixed days that never move', () => {
    const y = holidaysInYear(2027).map((h) => h.date);
    expect(y).toContain('2027-01-01'); // New Year's Day
    expect(y).toContain('2027-05-01'); // Labour Day
    expect(y).toContain('2027-06-01'); // Madaraka Day
    expect(y).toContain('2027-10-10'); // Huduma Day
    expect(y).toContain('2027-10-20'); // Mashujaa Day
    expect(y).toContain('2027-12-12'); // Jamhuri Day
    expect(y).toContain('2027-12-25'); // Christmas Day
    expect(y).toContain('2027-12-26'); // Boxing Day
  });

  it('computes Easter correctly across a spread of years', () => {
    // Known Gregorian Easter Sundays; Good Friday is two days before and
    // Easter Monday the day after. If the computus is wrong these drift.
    const cases: [number, string, string][] = [
      [2024, '2024-03-29', '2024-04-01'],
      [2025, '2025-04-18', '2025-04-21'],
      [2026, '2026-04-03', '2026-04-06'],
      [2027, '2027-03-26', '2027-03-29'],
      [2030, '2030-04-19', '2030-04-22'],
    ];
    for (const [year, goodFriday, easterMonday] of cases) {
      const days = holidaysInYear(year);
      expect(days.find((h) => h.name === 'Good Friday')?.date, `${year} Good Friday`).toBe(goodFriday);
      expect(days.find((h) => h.name === 'Easter Monday')?.date, `${year} Easter Monday`).toBe(easterMonday);
    }
  });

  it('observes a Sunday holiday on the Monday, and keeps the Sunday too', () => {
    // 1 Jan 2028 is a Saturday; 1 Jan 2033 is a Saturday. 1 May 2033 is a
    // Sunday, so Labour Day is observed on Monday the 2nd.
    const days = holidaysInYear(2033);
    expect(days.find((h) => h.date === '2033-05-01')?.name).toBe('Labour Day');
    const observed = days.find((h) => h.date === '2033-05-02');
    expect(observed?.name).toBe('Labour Day (observed)');
    expect(observed?.observed).toBe(true);
  });

  /**
   * The refusal, asserted.
   *
   * Eid al-Fitr and Eid al-Adha are lunar and declared by gazette, sometimes
   * at a day's notice and sometimes on a different day from the astronomical
   * estimate. A computed approximation would be wrong often enough to mislead
   * somebody planning a cash flow around it. If a future change adds one, this
   * fails — which is the intent.
   */
  it('does not invent the gazetted Eid dates', () => {
    expect(EID_IS_GAZETTED.length).toBe(2);
    for (const year of [2026, 2027, 2028]) {
      for (const h of holidaysInYear(year)) {
        expect(h.name, `${h.name} on ${h.date} looks computed`).not.toMatch(/eid/i);
      }
    }
  });
});

describe('when the money actually lands', () => {
  it('leaves an ordinary business day alone', () => {
    // 2026-07-28 is a Tuesday and not a holiday.
    const p = paymentDay('2026-07-28');
    expect(p.paid).toBe('2026-07-28');
    expect(p.reason).toBeNull();
    expect(p.daysLater).toBe(0);
  });

  it('moves a Mashujaa Day coupon to the next business day', () => {
    // 20 October 2026 is a Tuesday and Mashujaa Day, so payment is the 21st.
    const p = paymentDay('2026-10-20');
    expect(p.scheduled).toBe('2026-10-20');
    expect(p.paid).toBe('2026-10-21');
    expect(p.reason).toMatch(/Mashujaa Day/);
    expect(p.daysLater).toBe(1);
  });

  it('rolls a Saturday to the Monday', () => {
    // 2026-08-01 is a Saturday.
    const p = paymentDay('2026-08-01');
    expect(p.paid).toBe('2026-08-03');
    expect(p.reason).toMatch(/weekend/i);
    expect(p.daysLater).toBe(2);
  });

  it('clears a run of Christmas and Boxing Day plus a weekend', () => {
    // 25 Dec 2027 is a Saturday: Christmas Sat, Boxing Day Sun, observed
    // Monday the 27th — so the first business day is Tuesday the 28th.
    const p = paymentDay('2027-12-25');
    expect(p.paid).toBe('2027-12-28');
    expect(p.daysLater).toBe(3);
  });

  it('never pays before the scheduled date', () => {
    // Rolling backwards would be worse than not adjusting at all: money does
    // not arrive early because the due date was a holiday.
    for (const d of ['2026-01-01', '2026-04-03', '2026-12-12', '2026-08-01']) {
      expect(paymentDay(d).paid >= d, `${d} rolled backwards`).toBe(true);
    }
  });

  it('returns promptly and unchanged on an unparseable date', () => {
    const p = paymentDay('not-a-date');
    expect(p.paid).toBe(p.scheduled);
    expect(p.daysLater).toBe(0);
  });

  it('agrees with isBusinessDay', () => {
    // The mutation check: a paymentDay that always returned its input would
    // pass several assertions above but contradicts this one.
    for (const d of ['2026-10-20', '2026-08-01', '2026-12-25', '2027-01-01']) {
      expect(isBusinessDay(d)).toBe(false);
      expect(isBusinessDay(paymentDay(d).paid), `${d} landed on a non-business day`).toBe(true);
    }
  });
});

/**
 * The yields must not move.
 *
 * Accrued interest, day counts and YTM run on the SCHEDULED dates, because
 * that is what the instrument's terms say and what the prospectus prices.
 * This module is for telling a reader when cash turns up; wiring it into the
 * engine would quietly change every yield in the product.
 */
describe('the holiday calendar stays out of the maths', () => {
  it('is not imported by the financial engine or the yield paths', async () => {
    const { readFileSync } = await import('node:fs');
    const files = [
      'src/lib/financial-engine.ts',
      'src/lib/engine.ts',
      'src/lib/ladder.ts',
      'src/lib/sell.ts',
    ];
    for (const f of files) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      expect(src, `${f} imports the holiday calendar — yields would shift`).not.toMatch(
        /from ['"]\.\/holidays['"]|from ['"]@\/lib\/holidays['"]/
      );
    }
  });
});
