import { describe, it, expect } from 'vitest';
import bonds from '../../public/data/bonds.json';
import { getCouponDates, calculateAccruedInterest } from '../../src/lib/financial-engine';
import type { Bond } from '../../src/types/bond';

/**
 * The engine's day-count is not a preference, it is a claim about the data —
 * so it is checked against the data rather than against a fixture that agrees
 * with it by construction.
 *
 * Kenyan government bonds run on a 364-day year. Every bond CBK has issued in
 * this dataset is dated on a Monday, redeemed on a Monday, and lives a whole
 * number of 182-day coupon periods. If a future bond breaks that — a genuine
 * stub period, a Wednesday issue — these tests fail, and the schedule needs a
 * real irregular-period implementation rather than a silent wrong answer.
 */
const ALL = bonds as unknown as Bond[];
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('the 364-day year, checked against every listed bond', () => {
  it('has bonds to check', () => expect(ALL.length).toBeGreaterThan(20));

  it('issues and redeems every bond on a Monday', () => {
    const offGrid = ALL.filter(
      (b) => new Date(b.issueDate).getUTCDay() !== 1 || new Date(b.maturityDate).getUTCDay() !== 1
    );
    expect(offGrid.map((b) => b.issueCode)).toEqual([]);
  });

  it('spans a whole number of 182-day periods, with no stub', () => {
    const ragged = ALL.filter((b) => {
      const days = (new Date(b.maturityDate).getTime() - new Date(b.issueDate).getTime()) / DAY;
      return days % 182 !== 0;
    });
    expect(ragged.map((b) => b.issueCode)).toEqual([]);
  });

  it('lands the final coupon exactly on maturity, 182 days after the one before', () => {
    const wrong: string[] = [];
    for (const b of ALL) {
      const dates = getCouponDates(new Date(b.issueDate), new Date(b.maturityDate), 2);
      if (iso(dates[dates.length - 1]) !== b.maturityDate.slice(0, 10)) {
        wrong.push(`${b.issueCode}: ends ${iso(dates[dates.length - 1])}, matures ${b.maturityDate}`);
      }
      const gaps = new Set(dates.slice(1).map((d, i) => (d.getTime() - dates[i].getTime()) / DAY));
      if (gaps.size !== 1 || !gaps.has(182)) wrong.push(`${b.issueCode}: gaps ${Array.from(gaps)}`);
      if (dates.some((d) => d.getUTCDay() !== 1)) wrong.push(`${b.issueCode}: a coupon off-Monday`);
    }
    expect(wrong).toEqual([]);
  });

  it('reconciles accrual with the cheque: a full period is exactly half a coupon', () => {
    // The property that forces 364 rather than 365. Sampled on the day before
    // each bond's second coupon, where 181 of 182 days have run.
    const off: string[] = [];
    for (const b of ALL) {
      const second = getCouponDates(new Date(b.issueDate), new Date(b.maturityDate), 2)[1];
      if (!second) continue;
      const dayBefore = new Date(second.getTime() - DAY);
      const accrued = calculateAccruedInterest(b, dayBefore);
      const full = accrued + b.couponRate / 364;
      if (Math.abs(full - b.couponRate / 2) > 1e-9) {
        off.push(`${b.issueCode}: ${full} vs ${b.couponRate / 2}`);
      }
    }
    expect(off).toEqual([]);
  });
});
