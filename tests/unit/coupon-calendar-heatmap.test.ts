import { describe, expect, it } from 'vitest';
import { formatCalendarDateKey } from '../../src/components/CouponCalendarHeatmap';

describe('CouponCalendarHeatmap date keys', () => {
  it('builds plain calendar dates without UTC conversion', () => {
    expect(formatCalendarDateKey(2026, 7, 1)).toBe('2026-08-01');
    expect(formatCalendarDateKey(2026, 0, 9)).toBe('2026-01-09');
  });
});
