import { describe, expect, it } from 'vitest';

describe('headlineRows', () => {
  it('renders one card per indicator, the newest, never the history', async () => {
    const { headlineRows, HEADLINE } = await import('../../src/lib/macro-headline');
    const macro = (await import('../../public/data/macro.json')).default as { indicator: string; date: string }[];
    const rows = headlineRows(macro);
    const inds = rows.map((r) => r.indicator);
    expect(new Set(inds).size).toBe(inds.length);
    for (const r of rows) {
      const newest = macro.filter((m) => m.indicator === r.indicator).map((m) => m.date).sort().at(-1);
      expect(r.date).toBe(newest);
    }
    expect(inds).toEqual(HEADLINE.filter((h) => inds.includes(h)));
  });
});
