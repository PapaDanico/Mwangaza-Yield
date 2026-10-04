'use client';

import { useMemo } from 'react';
import MiniLineChart from '@/components/dashboard/MiniLineChart';

/**
 * The drawn curve history, split out so Recharts can be deferred.
 *
 * Recharts is ~101KB gzipped. This chart already ships its numbers as a table
 * immediately below it — two published series, deliberately no more — so the
 * drawing is an enhancement and arriving late costs nothing.
 *
 * Split rather than deferring the parent so that table stays in the page's
 * own chunk, rather than waiting on the chart bundle to appear.
 */
/* Drawn with MiniLineChart since 4 Oct 2026, no longer Recharts — this is the
   only chart on /yield-curve/, so the page no longer loads Recharts at all.
   Legend text is ink, the swatch carries the colour: the lightest years of the
   ramp were unreadable as coloured text (1.43:1). */
const xOf = (d: Record<string, number | string>) => Number(d.years);
const valueOf = (d: Record<string, number | string>, k: string) => {
  const v = d[k];
  return typeof v === 'number' ? v : null;
};

export default function CurveHistoryPlot({
  data,
  shown,
  last,
  colours,
}: {
  data: Record<string, number | string>[];
  shown: { year: number }[];
  last: number;
  colours: string[];
}) {
  const series = useMemo(
    () => shown.map((row, i) => ({
      key: String(row.year), name: String(row.year), color: colours[i % colours.length],
      width: row.year === last ? 2.5 : 1.5, dot: 2,
    })),
    [shown, last, colours],
  );
  const label = (x: number) => String(data.find((d) => Number(d.years) === x)?.tenor ?? '');
  return (
    <MiniLineChart
      data={data} x={xOf} series={series} value={valueOf} legend height={320}
      xLabel={label} tooltipLabel={(d) => `${d.tenor} tenor`}
    />
  );
}
