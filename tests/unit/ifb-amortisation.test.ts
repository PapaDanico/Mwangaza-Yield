import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Bond } from '../../src/types/bond';
import { analyseSale } from '../../src/lib/sell';
import { getCouponDates, solveYTMFromPrice } from '../../src/lib/financial-engine';

/* Amortisation schedules for every outstanding infrastructure bond, read from
 * CBK's own prospectuses on 27 Nov 2026 (docs/research/2026-11-27-credit-and-
 * bond-engine-gaps). Every schedule is worded "of (unencumbered) outstanding
 * principal amount". The cases below are CBK's printed YIELD/CLEAN PRICE
 * pairs and accrued interest, from the prospectus or re-opening named; both
 * engines must reproduce them from bonds.json alone. */
const bonds: Bond[] = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));
const byCode = new Map(bonds.map((b) => [b.issueCode, b]));
const TODAY = '2026-11-27';

describe('the schedules in bonds.json', () => {
  const ifbs = bonds.filter((b) => b.category === 'IFB' && b.maturityDate > TODAY);

  it('cover every outstanding infrastructure bond', () => {
    expect(ifbs.length).toBeGreaterThanOrEqual(20);
    expect(ifbs.filter((b) => !b.amortisation?.length).map((b) => b.issueCode)).toEqual([]);
  });

  it('are well formed: increasing dates inside the bond life, ending with 100% at maturity', () => {
    for (const b of ifbs) {
      const s = b.amortisation!;
      expect(s.at(-1), b.issueCode).toEqual({ date: b.maturityDate, fraction: 1 });
      for (let i = 0; i < s.length; i++) {
        expect(s[i].fraction > 0 && s[i].fraction <= 1, `${b.issueCode} ${s[i].date}`).toBe(true);
        expect(s[i].date > b.issueDate, `${b.issueCode} ${s[i].date}`).toBe(true);
        if (i) expect(s[i].date > s[i - 1].date, `${b.issueCode} order`).toBe(true);
      }
    }
  });

  it('fall on coupon dates (CBK schedules none off-cycle)', () => {
    for (const b of ifbs) {
      const grid = new Set(getCouponDates(new Date(b.issueDate), new Date(b.maturityDate), 2).map((d) => d.toISOString().slice(0, 10)));
      for (const step of b.amortisation!) expect(grid.has(step.date), `${b.issueCode} ${step.date}`).toBe(true);
    }
  });

  it('name a CBK prospectus as their source', () => {
    for (const b of ifbs) {
      expect(b.amortisationSource, b.issueCode).toMatch(/^https:\/\/www\.centralbank\.go\.ke\//);
      expect(b.amortisationNote, b.issueCode).toMatch(/outstanding/i);
    }
  });
});

// [issue code, settlement, CBK accrued interest per 100, yield %, CBK clean price, decimals CBK printed]
const CBK: [string, string, number, number, number, 3 | 4][] = [
  ['IFB1/2021/018', '2026-08-17', 4.6283, 11, 108.0281, 4], ['IFB1/2021/018', '2026-08-17', 4.6283, 14.5, 92.193, 4],
  ['IFB1/2021/021', '2026-08-17', 5.6337, 11, 109.765, 4], ['IFB1/2021/021', '2026-08-17', 5.6337, 14.5, 91.4554, 4],
  ['IFB1/2019/016', '2026-08-17', 3.8413, 11, 103.3254, 4], ['IFB1/2019/016', '2026-08-17', 3.8413, 14.5, 88.9009, 4],
  ['IFB1/2022/014', '2025-02-17', 3.7525, 12, 109.9007, 4], ['IFB1/2022/014', '2025-02-17', 3.7525, 15.5, 92.8741, 4],
  ['IFB1/2022/019', '2025-08-18', 0, 11, 111.7119, 4], ['IFB1/2022/019', '2025-08-18', 0, 14.5, 92.1491, 4],
  ['IFB1/2023/017', '2025-02-17', 6.3688, 12, 114.3329, 4], ['IFB1/2023/017', '2025-02-17', 6.3688, 15.5, 94.3108, 4],
  ['IFB1/2018/015', '2025-08-18', 0.9615, 11, 105.7116, 4], ['IFB1/2018/015', '2025-08-18', 0.9615, 14.5, 93.0366, 4],
  ['IFB1/2023/006.5', '2024-08-19', 4.828, 17, 102.5044, 4], ['IFB1/2023/006.5', '2024-08-19', 4.828, 18.5, 98.3691, 4],
  ['IFB1/2016/015', '2016-10-24', 0, 7, 137.071, 3], ['IFB1/2016/015', '2016-10-24', 0, 16, 80.478, 3],
  ['IFB1/2017/012', '2017-02-27', 0, 8, 127.301, 3], ['IFB1/2017/012', '2017-02-27', 0, 17, 80.556, 3],
  ['IFB1/2018/020', '2018-11-19', 0, 9, 122.385, 3], ['IFB1/2018/020', '2018-11-19', 0, 13, 93.537, 3],
  ['IFB1/2015/012', '2015-03-30', 0, 7, 124.819, 3],
  ['IFB1/2020/009', '2020-04-13', 0, 9, 109.284, 3], ['IFB1/2020/009', '2020-04-13', 0, 13, 90.529, 3],
  ['IFB1/2020/011', '2020-08-24', 0, 9, 110.879, 3], ['IFB1/2020/011', '2020-08-24', 0, 13, 89.661, 3],
];

describe("both engines reproduce CBK's printed prices from bonds.json", () => {
  it.each(CBK)('%s at %s, %s%% yield', (code, settle, ai, ytm, clean, dp) => {
    const bond = byCode.get(code)!;
    const tol = dp === 4 ? 0.00015 : 0.0006;
    const sale = analyseSale(bond, {
      faceValueKES: 100_000, settlementDate: settle, cleanPrice: clean, quotedYTM: ytm,
      commissionKES: 0, leviesKES: 0, amortisation: bond.amortisation,
    });
    expect(Math.abs(sale.accruedPer100 - ai)).toBeLessThan(0.00006);
    expect(Math.abs(sale.ourDirtyAtQuotedYTM! - sale.accruedPer100 - clean)).toBeLessThan(tol);
    // The purchase engine, from the bond alone: CBK's price must give back CBK's yield.
    expect(solveYTMFromPrice(bond, clean + ai, new Date(settle))).toBeCloseTo(ytm, 2);
  });

  it('a bullet model misstates them: CBK prices IFB1/2021/018 at 11.00%, a bullet reads 11.44%', () => {
    const bond = byCode.get('IFB1/2021/018')!;
    const bullet = { ...bond, amortisation: undefined };
    const y = solveYTMFromPrice(bullet, 108.0281 + 4.6283, new Date('2026-08-17'));
    expect(y).toBeGreaterThan(11.4); // measured 11.4446: 44 basis points overstated
    expect(solveYTMFromPrice(bond, 108.0281 + 4.6283, new Date('2026-08-17'))).toBeCloseTo(11, 3);
  });
});
