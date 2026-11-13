import { describe, expect, it } from 'vitest';
import imf from '../../public/data/imf-outlook.json';
import {
  BALANCE_SERIES_ID,
  DEBT_SERIES_ID,
  actualYears,
  fiscalHistory,
  interestBurden,
  lastActualYear,
  seriesById,
  toChartRows,
  windowed,
  type Observation,
} from '../../src/lib/fiscal-history';
import { licenceFor, mayRedistribute } from '../../src/lib/licences';

const obs = (rows: [number, number, Observation['status']][]): Observation[] =>
  rows.map(([year, value, status]) => ({ year, value, status }));

describe('the shipped history is the decade the chart promises', () => {
  for (const id of [DEBT_SERIES_ID, BALANCE_SERIES_ID]) {
    it(`${id} has at least ten years of actual figures, in order, without a gap`, () => {
      const s = seriesById(id)!;
      expect(s).not.toBeNull();
      expect(actualYears(s.observations)).toBeGreaterThanOrEqual(10);
      const years = s.observations.map((o) => o.year);
      expect(years).toEqual([...years].sort((a, b) => a - b));
      for (let i = 1; i < years.length; i++) expect(years[i] - years[i - 1], `${id} skips a year before ${years[i]}`).toBe(1);
      // No projection is ever followed by an actual figure.
      const firstProjection = s.observations.findIndex((o) => o.status === 'projection');
      if (firstProjection >= 0) expect(s.observations.slice(firstProjection).every((o) => o.status === 'projection')).toBe(true);
    });
  }

  it('agrees exactly with the IMF file already shipped, wherever both have a year', () => {
    // The pull was validated this way on 13 Nov: 12 overlapping years, no mismatch.
    const bySubject: Record<string, string> = { GGXWDG_NGDP: DEBT_SERIES_ID, GGXCNL_NGDP: BALANCE_SERIES_ID };
    for (const w of imf as { weoSubject: string; observations: { year: number; value: number; status: string }[] }[]) {
      const id = bySubject[w.weoSubject];
      if (!id) continue;
      const mine = new Map(seriesById(id)!.observations.map((o) => [o.year, o]));
      for (const o of w.observations) {
        expect(mine.get(o.year)?.value, `${id} ${o.year}`).toBe(o.value);
        expect(mine.get(o.year)?.status, `${id} ${o.year} status`).toBe(o.status);
      }
    }
  });

  it('cites only publishers the licence registry permits', () => {
    for (const s of fiscalHistory.series) expect(mayRedistribute(s.source), s.source).toBe(true);
    expect(licenceFor(fiscalHistory.treasury.source)?.id).toBe('National Treasury');
    expect(mayRedistribute(fiscalHistory.treasury.source)).toBe(true);
    for (const s of fiscalHistory.series) expect(s.sourceNote.length).toBeGreaterThan(60);
  });
});

describe('windowed and toChartRows', () => {
  const o = obs([
    [2019, 1, 'outturn'], [2020, 2, 'outturn'], [2021, 3, 'outturn'],
    [2022, 4, 'estimate'], [2023, 5, 'projection'], [2024, 6, 'projection'],
  ]);

  it('takes N years of actual history ending at the latest actual year, and keeps every projection', () => {
    expect(lastActualYear(o)).toBe(2022);
    expect(windowed(o, 2).map((x) => x.year)).toEqual([2021, 2022, 2023, 2024]);
    expect(windowed(o, null)).toEqual(o);
  });

  it('joins the dashed projection to the solid line at the last actual year, and nowhere else', () => {
    const rows = toChartRows(o);
    expect(rows.find((r) => r.year === 2022)).toEqual({ year: 2022, actual: 4, projection: 4 });
    expect(rows.find((r) => r.year === 2021)).toEqual({ year: 2021, actual: 3, projection: null });
    expect(rows.find((r) => r.year === 2023)).toEqual({ year: 2023, actual: null, projection: 5 });
  });

  it('draws nothing it does not have: an empty series is empty, not zero', () => {
    expect(toChartRows([])).toEqual([]);
    expect(lastActualYear(obs([[2030, 1, 'projection']]))).toBeNull();
    expect(windowed(obs([[2030, 1, 'projection']]), 5)).toHaveLength(1);
  });
});

describe('interestBurden', () => {
  it('divides interest by the SAME column\'s revenue, not the printed row that is offset by one', () => {
    const b = interestBurden();
    const byLabel = Object.fromEntries(b.map((x) => [x.label, x.pct]));
    // June 2007: 41.30 / 690.73 = 6.0%. The printed row's 12.20 is 41.30 / 338.51, the 2002 revenue.
    expect(byLabel['Jun 2007']).toBe(6.0);
    expect(byLabel['Jun 2017']).toBe(14.1);
    expect(byLabel['Jun 2024']).toBe(34.9);
    expect(byLabel['Jun 2007']).not.toBe(12.2);
  });

  it('marks the provisional year as provisional and keeps the burden rising over the decade', () => {
    const b = interestBurden();
    expect(b[b.length - 1].provisional).toBe(true);
    const at = (l: string) => b.find((x) => x.label === l)!.pct;
    expect(at('Jun 2025')).toBeGreaterThan(at('Jun 2017'));
    expect(at('Jun 2017')).toBeGreaterThan(at('Jun 2012'));
  });
});
