import { describe, expect, it } from 'vitest';
import tbills from '../../public/data/tbills.json';
import macro from '../../public/data/macro.json';
import bonds from '../../public/data/bonds.json';
import prints from '../../public/data/auction-results.json';
import { breakevenYears, decisionBrief, LOCK_IN_NEGLIGIBLE_PP, type BriefInput } from '../../src/lib/decision-brief';
import { computeTBill } from '../../src/lib/tbills';
import type { AuctionPrint, Bond, MacroIndicator, TBill } from '../../src/types/bond';

const base: BriefInput = {
  tbills: tbills as TBill[],
  macro: macro as MacroIndicator[],
  bonds: bonds as Bond[],
  prints: prints as AuctionPrint[],
  expectedInflation1y: 6.15,
  asOf: new Date('2026-10-30'),
};
const get = (id: string, input = base) => decisionBrief(input).find((i) => i.id === id);

describe('decision brief on the shipped data', () => {
  it('produces all three insights', () => {
    expect(decisionBrief(base).map((i) => i.id)).toEqual(['lock-in', 'real-return', 'long-bond']);
  });

  it('lock-in quotes the real after-tax gap between the 364 and 91-day bill', () => {
    const t = (d: number) => computeTBill(100_000, (tbills as TBill[]).find((b) => b.tenorDays === d)!.discountRate, d).netEAY;
    const gap = t(364) - t(91);
    const item = get('lock-in')!;
    expect(item.detail).toContain(`${gap.toFixed(2)} points more than the 91-day`);
    expect(item.detail).not.toContain(`${t(91).toFixed(2)}%`); // the yields themselves are on the page already
    if (gap < LOCK_IN_NEGLIGIBLE_PP) expect(item.tone).toBe('watch');
  });

  it('states gaps between rates in points, never as a percentage of a percentage', () => {
    for (const i of decisionBrief(base)) expect(i.headline + i.detail).not.toMatch(/\d%\s+(more|less|above|below)/);
  });

  it('judges the real return against MEASURED inflation, with the survey only as a labelled clause', () => {
    const item = get('real-return')!;
    expect(item.detail).toMatch(/an opinion, not a measurement/);
    expect(get('real-return', { ...base, expectedInflation1y: null })!.detail).not.toMatch(/opinion/);
  });

  it('the long-bond insight prices the one-point shock exactly (price falls, never rises)', () => {
    const item = get('long-bond')!;
    const m = item.detail.match(/fall about ([\d.]+)%/);
    expect(item.detail).toMatch(/only if you sell before maturity/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });
});

describe('absence is not zero', () => {
  it('survives archive rows that carry no auction date (13 of them ship today)', () => {
    expect((prints as AuctionPrint[]).some((p) => !p.auctionDate)).toBe(true);
    expect(() => decisionBrief(base)).not.toThrow();
  });

  it('drops an insight whose inputs are missing instead of inventing them', () => {
    expect(decisionBrief({ ...base, tbills: [] })).toEqual([]);
    const noCpi = decisionBrief({ ...base, macro: [] }).map((i) => i.id);
    expect(noCpi).not.toContain('real-return');
    expect(noCpi).toContain('lock-in');
  });

  it('drops the real-return insight when the CPI is stale, rather than comparing against an old print', () => {
    const ids = decisionBrief({ ...base, asOf: new Date('2027-06-30') }).map((i) => i.id);
    expect(ids).not.toContain('real-return');
  });

  it('says short bills pay more when the curve is inverted at the front', () => {
    const inverted = (tbills as TBill[]).map((b) => ({ ...b, discountRate: b.tenorDays === 364 ? 7 : 9 }));
    const item = get('lock-in', { ...base, tbills: inverted })!;
    expect(item.headline).toMatch(/Short bills pay more/);
    expect(item.tone).toBe('watch');
  });
});

describe('break-even holding period', () => {
  it('is the price fall divided by the extra yearly pickup, in words', () => {
    expect(breakevenYears(6.5, 5.1)).toBe('1.3 years');
    expect(breakevenYears(2, 6)).toBe('4 months');
    expect(breakevenYears(0.1, 6)).toBe('less than a month');
    expect(breakevenYears(80, 4)).toBe('more than ten years');
  });

  it('appears on the shipped long-bond line, consistent with its own numbers', () => {
    const d = get('long-bond')!.detail;
    const fall = Number(d.match(/fall about ([\d.]+)%/)![1]);
    const pick = Number(get('long-bond')!.headline.match(/pays ([\d.]+) points/)![1]);
    expect(d).toContain(`take about ${breakevenYears(fall, pick)} to make up that fall`);
  });
});
