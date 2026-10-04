'use client';

import { useCallback } from 'react';
import MiniLineChart, { type Series } from './MiniLineChart';

export interface RatePoint {
  label: string;
  rate: number;
  date?: string;
}

/**
 * The drawn rate history, split out so Recharts can be deferred.
 *
 * Same reasoning as YieldCurvePlot: ~101KB gzipped sat in the first-load
 * bundle of every page with a chart, and this one is safe to defer because
 * the "Recent decisions" list beside it already prints each plotted rate as
 * text. The list stays server-rendered; only the drawing waits.
 */
/* A step line, because the rate genuinely holds flat between meetings — a
   smooth curve would imply movement that never happened. Drawn with
   MiniLineChart since 4 Oct 2026, no longer Recharts: see that file. */
const SERIES: Series[] = [{ key: 'rate', name: 'Central Bank Rate', color: '#D97706', step: true }];
const valueOf = (d: RatePoint) => d.rate;

export default function RateCyclePlot({
  series,
  current,
}: {
  series: RatePoint[];
  current: number;
}) {
  const xOf = useCallback((d: RatePoint) => series.indexOf(d), [series]);
  return (
    <MiniLineChart
      data={series} x={xOf} series={SERIES} value={valueOf} referenceY={current} height={208}
      xLabel={(i) => series[i]?.label ?? ''} tooltipLabel={(d) => d.date ?? d.label}
    />
  );
}
