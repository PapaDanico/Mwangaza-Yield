'use client';

import { useMemo, useState } from 'react';
import MiniLineChart, { type Series } from '@/components/dashboard/MiniLineChart';
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
  type ChartRow,
} from '@/lib/fiscal-history';

type View = 'debt' | 'balance';
type Span = 10 | null;

const VIEWS: { key: View; label: string; id: string }[] = [
  { key: 'debt', label: 'Debt', id: DEBT_SERIES_ID },
  { key: 'balance', label: 'Deficit', id: BALANCE_SERIES_ID },
];
const SPANS: { key: Span; label: string }[] = [
  { key: 10, label: '10 years' },
  { key: null, label: 'Since 2000' },
];

const SERIES: Series[] = [
  { key: 'actual', name: 'IMF figures to date', color: '#B7791F', dot: 3 },
  { key: 'projection', name: 'IMF projection', color: '#B7791F', dashed: true, dot: 3 },
];

const pct = (v: number) => `${v.toFixed(1)}%`;
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

/**
 * Ten or more years of Kenya's debt and deficit, with the IMF's projection
 * dashed so a forecast is never read as a measurement. The data, its sources
 * and every refusal (no splicing of the Treasury's different debt measure, no
 * printed ratio that is offset a column) are in `lib/fiscal-history.ts`.
 */
export default function FiscalHistoryChart() {
  const [view, setView] = useState<View>('debt');
  const [span, setSpan] = useState<Span>(10);

  const id = VIEWS.find((v) => v.key === view)!.id;
  const series = seriesById(id);
  const rows = useMemo(() => (series ? toChartRows(windowed(series.observations, span)) : []), [series, span]);
  const obs = useMemo(() => (series ? windowed(series.observations, span) : []), [series, span]);

  // The summary stands on measurements. The IMF's estimate for the latest year
  // is said separately, as the Debt / GDP tile below it also rests on an outturn.
  const summary = useMemo(() => {
    if (!series) return null;
    const outturn = obs.filter((o) => o.status === 'outturn');
    if (outturn.length < 2) return null;
    const first = outturn[0];
    const end = outturn[outturn.length - 1];
    const avg = outturn.reduce((a, o) => a + o.value, 0) / outturn.length;
    const estimate = obs.find((o) => o.status === 'estimate') ?? null;
    return { first, end, avg, years: outturn.length, estimate };
  }, [series, obs]);

  const burden = useMemo(() => interestBurden(), []);
  if (!series || rows.length === 0) return null;
  const years = actualYears(series.observations);

  const valueOf = (d: ChartRow, key: string) => (key === 'actual' ? d.actual : d.projection);
  const lastObs = obs[obs.length - 1];
  const tr = fiscalHistory.treasury;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Which measure to chart" className="inline-flex rounded-lg border border-sand-300 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="radio"
              aria-checked={view === v.key}
              onClick={() => setView(v.key)}
              className={`min-h-11 rounded-md px-4 text-sm font-semibold ${view === v.key ? 'bg-treasury-navy text-sand-50' : 'text-ink hover:bg-sand-50'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="How far back to chart" className="inline-flex rounded-lg border border-sand-300 p-0.5">
          {SPANS.map((s) => (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={span === s.key}
              onClick={() => setSpan(s.key)}
              className={`min-h-11 rounded-md px-3 text-sm font-semibold ${span === s.key ? 'bg-treasury-navy text-sand-50' : 'text-ink hover:bg-sand-50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-sm font-medium text-ink">
        {series.label}, {series.unit}
      </p>
      {summary && (
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {view === 'debt' ? (
            <>
              From {summary.first.year} to {summary.end.year} debt moved from <strong>{pct(summary.first.value)}</strong> to{' '}
              <strong>{pct(summary.end.value)}</strong> of GDP, a change of <strong>{signed(summary.end.value - summary.first.value)} points</strong>.
              {summary.estimate && <> The IMF&apos;s estimate for {summary.estimate.year} is <strong>{pct(summary.estimate.value)}</strong>
              {lastObs.status === 'projection' && <>, and it projects <strong>{pct(lastObs.value)}</strong> by {lastObs.year}</>}.</>}
            </>
          ) : (
            <>
              Over {summary.years} years the overall balance averaged <strong>{signed(summary.avg)}% of GDP</strong>, from{' '}
              <strong>{signed(summary.first.value)}%</strong> in {summary.first.year} to <strong>{signed(summary.end.value)}%</strong> in {summary.end.year}.
              Negative is a deficit, and debt is the running total of deficits.
            </>
          )}
        </p>
      )}

      <div className="mt-2 h-[280px]">
        <MiniLineChart
          data={rows}
          x={(d) => d.year}
          series={SERIES}
          value={valueOf}
          xLabel={(x) => String(x)}
          tooltipLabel={(d) => `${d.year}${d.actual == null ? ' (projection)' : ''}`}
          referenceY={view === 'debt' ? 55 : undefined}
          legend
          height={280}
        />
      </div>
      {view === 'debt' && (
        <p className="mt-1 text-xs text-ink-faint">
          Dashed grey line: 55% of GDP, the IMF&apos;s indicative ceiling for emerging markets.
        </p>
      )}

      <details className="group mt-3 rounded-xl border border-sand-200 bg-sand-50/60 px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink marker:content-none">
          The figures, year by year
          <span aria-hidden className="text-lg text-gold-700 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="overflow-x-auto pb-4">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{series.label}, {series.unit}, by year, with whether each is a measurement, an estimate or a projection</caption>
            <thead>
              <tr className="border-b border-sand-300 text-xs text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Year</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">{series.unit}</th>
                <th scope="col" className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {obs.map((o) => (
                <tr key={o.year} className="border-b border-sand-200 last:border-0">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-ink">{o.year}</th>
                  <td className="num py-1.5 pr-3 text-right text-ink">{signed(o.value)}</td>
                  <td className="py-1.5 text-ink-soft">{o.status === 'projection' ? 'IMF projection' : o.status === 'estimate' ? 'IMF estimate' : 'Outturn'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group mt-3 rounded-xl border border-sand-200 bg-sand-50/60 px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink marker:content-none">
          The Treasury&apos;s own figures, and how much of revenue goes to interest
          <span aria-hidden className="text-lg text-gold-700 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 pb-4 text-sm leading-relaxed text-ink-soft">
          <p>
            The National Treasury counts public and publicly guaranteed debt at each 30 June, a wider measure than the IMF&apos;s. It
            is shown here beside the IMF line, never joined to it.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">National Treasury public and publicly guaranteed debt, percent of GDP, and interest as a share of ordinary revenue, by year end</caption>
              <thead>
                <tr className="border-b border-sand-300 text-xs text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Year end</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Debt, % of GDP</th>
                  <th scope="col" className="py-2 text-right font-medium">Interest, % of revenue</th>
                </tr>
              </thead>
              <tbody>
                {tr.ppgDebtToGDP.map((d) => {
                  const b = burden.find((x) => x.label === d.label);
                  return (
                    <tr key={d.label} className="border-b border-sand-200 last:border-0">
                      <th scope="row" className="py-1.5 pr-3 font-medium text-ink">{d.label}</th>
                      <td className="num py-1.5 pr-3 text-right text-ink">{pct(d.value)}</td>
                      <td className="num py-1.5 text-right text-ink">{b ? `${pct(b.pct)}${b.provisional ? ' (provisional)' : ''}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Interest is divided by the same year&apos;s ordinary revenue, both from the Treasury&apos;s table. The table&apos;s own
            printed ratio row is offset by one column from its components, so it is not used. A blank means the Treasury publishes no
            figure for that column.
          </p>
        </div>
      </details>

      <p className="mt-3 text-xs text-ink-faint">
        {years} years of figures to {lastActualYear(series.observations)}. Source: {series.source} (calendar years,{' '}
        <a href={series.sourceUrl} className="underline" target="_blank" rel="noreferrer">series</a>) and {tr.source}.
      </p>
    </div>
  );
}
