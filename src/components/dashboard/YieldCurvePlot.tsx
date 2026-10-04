'use client';

import MiniLineChart, { type Series } from './MiniLineChart';

export interface CurvePoint {
  tenor: number;
  fxd?: number;
  ifb?: number;
  code: string;
}

/**
 * The drawn curve, and NOTHING ELSE — split out so it can be deferred.
 *
 * Recharts is ~101KB gzipped, and it sat in the first-load bundle of every
 * page carrying a chart whether or not the reader ever scrolled to one. The
 * dashboard shipped 256KB against an 88KB baseline on text-only pages.
 *
 * Deferring it is only safe because of what landed alongside it: every chart
 * here now prints its numbers as text — this curve has its data table, the
 * rate cycle and the auction history have their lists. The chart became a
 * genuine enhancement rather than the only way to read the figures, which is
 * what makes arriving a moment later cost nothing.
 *
 * WHY THIS FILE EXISTS AT ALL, rather than a one-line `dynamic()` on the
 * parent: the table lives INSIDE the parent, so deferring the whole component
 * would defer the table with it. The table would then wait on a second network
 * round trip — the chart chunk — before a screen reader had anything to read,
 * on the page whose text equivalent was the point. Splitting keeps the table
 * in the page's own chunk, where it appears the moment the page hydrates, and
 * sends only the drawing away.
 *
 * A first version of this comment claimed the one-line form would have pulled
 * the table out of the SERVER-RENDERED HTML. That was wrong and is corrected
 * here: nothing in this component is server-rendered either way. It reads from
 * useBondStore, which is empty at build time, so the whole card returns
 * <DataState /> during prerender and every figure on it — chart, table and
 * caption alike — arrives on hydration. Worth knowing before anyone cites the
 * static export as evidence that this content is in the initial HTML.
 */
const SERIES: Series[] = [
  { key: 'fxd', name: 'Regular bonds (before tax)', color: '#D97706' },
  { key: 'ifb', name: 'Infrastructure bonds (tax-free)', color: '#059669', dashed: true },
];
const xOf = (d: CurvePoint) => d.tenor;
const valueOf = (d: CurvePoint, k: string) => (k === 'fxd' ? d.fxd : d.ifb);

/* Drawn with MiniLineChart since 4 Oct 2026, no longer Recharts: see that file. */
export default function YieldCurvePlot({ data }: { data: CurvePoint[] }) {
  return (
    <MiniLineChart
      data={data} x={xOf} series={SERIES} value={valueOf} legend height={256}
      xLabel={(t) => `${t}y`} tooltipLabel={(d) => `${d.tenor}-year bond`}
    />
  );
}
