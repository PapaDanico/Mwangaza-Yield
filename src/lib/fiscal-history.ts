/**
 * Annual fiscal history behind the Fiscal Health chart on /macro/.
 *
 * WHY THIS EXISTS. The chart used to plot `DEBT_TO_GDP` rows from macro.json:
 * one, occasionally two points, so a "trajectory" with no trajectory in it. A
 * reader judging whether Kenya's debt is getting better or worse needs at
 * least a decade, and the deficit beside it, because debt is the running total
 * of deficits. The IMF publishes both annually back to 1982, and the figures
 * had simply never been read.
 *
 * WHAT IT REFUSES TO DO. It does not splice measures. The IMF's general
 * government gross debt and the Treasury's public and publicly guaranteed debt
 * are different things (coverage, valuation date), so they are never joined
 * into one line; the Treasury's June year-end points sit in their own table.
 * It does not draw a projection as a fact: every observation carries its
 * status and the chart dashes anything past the latest estimate. And it does
 * not copy the Treasury's printed interest ratio, which is offset by one
 * column from its own components; it divides interest by the SAME year's
 * revenue instead. See the file's sourceNote for the arithmetic that showed it.
 */
import raw from '../../public/data/fiscal-history.json';

export type ObservationStatus = 'outturn' | 'estimate' | 'projection';

export interface Observation {
  year: number;
  value: number;
  status: ObservationStatus;
}

export interface HistorySeries {
  id: string;
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  sourceNote: string;
  observations: Observation[];
}

export interface InterestRow {
  label: string;
  interestKESBn: number;
  ordinaryRevenueKESBn: number;
  provisional?: boolean;
}

export interface FiscalHistory {
  schema: number;
  curatedAt: string;
  series: HistorySeries[];
  treasury: {
    source: string;
    sourceUrl: string;
    sourceNote: string;
    ppgDebtToGDP: { label: string; value: number }[];
    interest: InterestRow[];
  };
}

export const fiscalHistory = raw as unknown as FiscalHistory;

export const DEBT_SERIES_ID = 'gg-gross-debt-gdp';
export const BALANCE_SERIES_ID = 'gg-overall-balance-gdp';

export function seriesById(id: string, data: FiscalHistory = fiscalHistory): HistorySeries | null {
  return data.series.find((s) => s.id === id) ?? null;
}

/** The latest year that is a measurement or the IMF's estimate, not a projection. */
export function lastActualYear(obs: Observation[]): number | null {
  const actual = obs.filter((o) => o.status !== 'projection').map((o) => o.year);
  return actual.length ? Math.max(...actual) : null;
}

/** Whole years of actual (non-projected) history in a series. */
export function actualYears(obs: Observation[]): number {
  const a = obs.filter((o) => o.status !== 'projection');
  return a.length ? Math.max(...a.map((o) => o.year)) - Math.min(...a.map((o) => o.year)) + 1 : 0;
}

/**
 * The observations to draw: `years` of actual history ending at the latest
 * actual year, plus every projection after it. `years: null` is everything.
 */
export function windowed(obs: Observation[], years: number | null): Observation[] {
  const last = lastActualYear(obs);
  if (last == null || years == null) return obs;
  const from = last - years + 1;
  return obs.filter((o) => o.year >= from);
}

export interface ChartRow {
  year: number;
  /** Actual history. Absent on projected years. */
  actual: number | null;
  /** Projection. Also carries the last actual year so the dashed line joins the solid one. */
  projection: number | null;
}

/** Two series for the chart, so the projection can be dashed and the join is unbroken. */
export function toChartRows(obs: Observation[]): ChartRow[] {
  const last = lastActualYear(obs);
  return obs.map((o) => ({
    year: o.year,
    actual: o.status === 'projection' ? null : o.value,
    projection: o.status === 'projection' || o.year === last ? o.value : null,
  }));
}

export interface InterestBurden {
  label: string;
  /** Interest as a percentage of the SAME column's ordinary revenue. */
  pct: number;
  interestKESBn: number;
  ordinaryRevenueKESBn: number;
  provisional: boolean;
}

export function interestBurden(data: FiscalHistory = fiscalHistory): InterestBurden[] {
  return data.treasury.interest.map((r) => ({
    label: r.label,
    pct: Math.round((r.interestKESBn / r.ordinaryRevenueKESBn) * 1000) / 10,
    interestKESBn: r.interestKESBn,
    ordinaryRevenueKESBn: r.ordinaryRevenueKESBn,
    provisional: r.provisional === true,
  }));
}
