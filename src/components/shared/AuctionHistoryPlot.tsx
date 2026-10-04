'use client';

import { useCallback } from 'react';
import MiniLineChart, { type Series } from '@/components/dashboard/MiniLineChart';

export interface AuctionPoint {
  label: string;
  rate: number;
  date?: string;
  transactionType?: string;
}

/**
 * The drawn auction history, split out so Recharts can be deferred.
 *
 * Recharts is ~101KB gzipped and sat in the first-load bundle of every page
 * carrying a chart. This one is safe to defer because the list beside it
 * already prints each plotted auction as text — the drawing is an
 * enhancement, not the only way to read the figures.
 *
 * Split rather than deferring the parent, so the list stays in the page's own
 * chunk and appears on hydration instead of waiting on the chart bundle.
 */
/* Straight segments, not a curve: between two auctions nothing was measured,
   so a smooth line would draw prices that were never observed. Drawn with
   MiniLineChart since 4 Oct 2026, no longer Recharts. */
const SERIES: Series[] = [{ key: 'rate', name: 'Auction cleared at', color: '#0F766E' }];
const valueOf = (d: AuctionPoint) => d.rate;

export default function AuctionHistoryPlot({
  series,
  latestRate,
}: {
  series: AuctionPoint[];
  latestRate: number;
}) {
  const xOf = useCallback((d: AuctionPoint) => series.indexOf(d), [series]);
  return (
    <MiniLineChart
      data={series} x={xOf} series={SERIES} value={valueOf} referenceY={latestRate} height={176}
      xLabel={(i) => series[i]?.label ?? ''} tooltipLabel={(d) => d.date ?? d.label}
    />
  );
}
