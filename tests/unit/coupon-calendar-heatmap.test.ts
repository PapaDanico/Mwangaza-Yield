import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('../../src/components/CouponCalendarHeatmap.tsx', import.meta.url), 'utf8');

describe('CouponCalendarHeatmap date keys', () => {
  it('builds month-cell keys from calendar parts instead of UTC conversion', () => {
    expect(SOURCE).toContain('export function formatCalendarDateKey(year: number, month: number, day: number)');
    expect(SOURCE).toContain("return `${year}-${pad2(month + 1)}-${pad2(day)}`;");
    expect(SOURCE).toContain('const iso = formatCalendarDateKey(year, month, dayNumber);');
  });
});
