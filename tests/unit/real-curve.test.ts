import { describe, it, expect } from 'vitest';
import {
  annualInflation, realCurveRows, partialYearNote, MIN_MONTHS_FOR_YEAR,
} from '../../src/lib/real-curve';
import type { CurveYear } from '../../src/lib/yield-curve';

const months = (year: number, values: number[]) =>
  values.map((value, i) => ({ date: `${year}-${String(i + 1).padStart(2, '0')}-01`, value }));

const twelve = (year: number, v: number) => months(year, Array(12).fill(v));

const yearRow = (year: number, cells: { label: string; years: number; rate: number }[]): CurveYear =>
  ({ year, cells, drawable: true } as unknown as CurveYear);

describe('annualInflation', () => {
  it('averages a full year', () => {
    const out = annualInflation([...twelve(2023, 7.0), ...twelve(2024, 5.0)]);
    expect(out.get(2023)!.pct).toBe(7);
    expect(out.get(2023)!.monthsUsed).toBe(12);
    expect(out.get(2024)!.pct).toBe(5);
  });

  it('reports a partial year rather than hiding or padding it', () => {
    const out = annualInflation(months(2026, [6.4, 6.5, 6.6]));
    expect(out.get(2026)!.monthsUsed).toBe(3);
    expect(out.get(2026)!.pct).toBeCloseTo(6.5, 3);
  });

  it('refuses a year too thin to average', () => {
    const out = annualInflation(months(2026, [6.4, 6.5]));
    expect(out.has(2026)).toBe(false);
    expect(MIN_MONTHS_FOR_YEAR).toBe(3);
  });

  it('drops one bad row without poisoning the year', () => {
    const bad = [
      ...months(2023, [7, 7, 7, 7]),
      { date: 'not-a-date', value: 7 },
      { date: '2023-05-01', value: Number.NaN },
    ] as { date: string; value: number }[];
    const out = annualInflation(bad);
    expect(out.get(2023)!.monthsUsed).toBe(4);
    expect(out.get(2023)!.pct).toBe(7);
  });
});

describe('realCurveRows', () => {
  const rows = [
    yearRow(2023, [
      { label: '2y', years: 2, rate: 16.0 },
      { label: '15y', years: 15, rate: 16.0 },
    ]),
  ];
  const infl = annualInflation(twelve(2023, 7.667));

  it('taxes short and long tenors differently, as the engine does', () => {
    const [y] = realCurveRows(rows, infl);
    const short = y.cells.find((c) => c.label === '2y')!;
    const long = y.cells.find((c) => c.label === '15y')!;
    expect(short.whtRate).toBe(0.15);
    expect(long.whtRate).toBe(0.1);
    // Identical gross, different net — a flat WHT would make these equal and
    // tilt the whole real curve in a direction the market did not.
    expect(short.netRate).not.toBe(long.netRate);
    expect(long.netRate).toBeGreaterThan(short.netRate);
  });

  it('uses the Fisher relation, not subtraction', () => {
    const [y] = realCurveRows(rows, infl);
    const long = y.cells.find((c) => c.label === '15y')!;
    const net = 16.0 * 0.9; // 14.4
    const fisher = ((1 + net / 100) / (1 + 7.667 / 100) - 1) * 100;
    expect(long.realRate).toBeCloseTo(fisher, 2);
    // Subtraction would give 14.4 - 7.667 = 6.733; Fisher gives ~6.25.
    expect(long.realRate).not.toBeCloseTo(net - 7.667, 2);
  });

  it('keeps gross visible so the tax bite stays legible', () => {
    const [y] = realCurveRows(rows, infl);
    expect(y.cells.every((c) => c.grossRate === 16.0)).toBe(true);
  });

  it('puts the real figure in `rate` so a chart needs no branch', () => {
    const [y] = realCurveRows(rows, infl);
    expect(y.cells.every((c) => c.rate === c.realRate)).toBe(true);
  });

  it('DROPS a year with no CPI rather than passing it through nominal', () => {
    // The failure this guards: a chart showing a deflated 2023 line beside an
    // undeflated 2026 one, two quantities on one axis under one legend.
    const withUnknownYear = [...rows, yearRow(1999, [{ label: '2y', years: 2, rate: 12 }])];
    const out = realCurveRows(withUnknownYear, infl);
    expect(out.map((y) => y.year)).toEqual([2023]);
  });

  it('can produce a negative real rate, which is the whole point', () => {
    const hot = annualInflation(twelve(2022, 9.6));
    const [y] = realCurveRows([yearRow(2022, [{ label: '2y', years: 2, rate: 10.0 }])], hot);
    expect(y.cells[0].realRate).toBeLessThan(0);
  });
});

describe('partialYearNote', () => {
  it('names the partial years', () => {
    const out = realCurveRows(
      [yearRow(2026, [{ label: '2y', years: 2, rate: 15 }])],
      annualInflation(months(2026, [6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.49]))
    );
    expect(partialYearNote(out)).toMatch(/2026 \(7 months\)/);
  });

  it('says nothing when every year is complete', () => {
    const out = realCurveRows(
      [yearRow(2023, [{ label: '2y', years: 2, rate: 15 }])],
      annualInflation(twelve(2023, 7))
    );
    expect(partialYearNote(out)).toBeNull();
  });

  it('gets the singular right', () => {
    // A one-month year cannot reach MIN_MONTHS_FOR_YEAR, so this checks the
    // grammar path directly rather than through annualInflation.
    const note = partialYearNote([
      { year: 2026, cells: [], inflation: { year: 2026, pct: 6.5, monthsUsed: 1 } },
    ] as never);
    expect(note).toMatch(/1 month\)/);
    expect(note).not.toMatch(/1 months/);
  });
});

/* End to end, from an auction print: a 20-year bond re-opened with about 6.4
 * years left lands in the 5-year bucket, and the real curve must still net it
 * at 10%, as CBK withheld (June 2026 prospectus). Taxing by the bucket's
 * remaining-term years gave 15%; mutation-checked 27 Nov 2026. */
describe('realCurveRows taxes by original tenor', () => {
  it('nets a re-opened long bond in a short bucket at 10%', async () => {
    const { readFileSync } = await import('node:fs');
    const { curveRows } = await import('../../src/lib/yield-curve');
    const bonds = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));
    const built = curveRows(
      [{ issueCode: 'FXD1/2012/020', auctionDate: '2026-06-17', weightedAverageRate: 13 } as never],
      bonds
    );
    const [y] = realCurveRows(built, annualInflation(twelve(2026, 6)));
    expect(y.cells[0].years).toBe(5);
    expect(y.cells[0].whtRate).toBe(0.1);
    expect(y.cells[0].netRate).toBeCloseTo(11.7, 3);
  });
});
