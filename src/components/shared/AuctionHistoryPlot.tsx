'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

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
export default function AuctionHistoryPlot({
  series,
  latestRate,
}: {
  series: AuctionPoint[];
  latestRate: number;
}) {
  return (
    <ResponsiveContainer>
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C" minTickGap={24} />
        <YAxis
          tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C"
          tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={52} domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{ background: '#FDFBF5', border: '1px solid #E3D8BE', borderRadius: 12, color: '#0A192F' }}
          labelStyle={{ color: '#8B8676' }}
          formatter={(v: number) => [`${v.toFixed(2)}%`, 'Auction cleared at']}
          labelFormatter={(l, p) => p?.[0]?.payload?.date ?? l}
        />
        <ReferenceLine y={latestRate} stroke="#CBBD9C" strokeDasharray="4 4" />
        {/* Straight segments, not a curve: between two auctions nothing was
            measured, so a smooth line would draw prices that were never
            observed. */}
        <Line
          type="linear" dataKey="rate" stroke="#0F766E" strokeWidth={2.5}
          dot={{ r: 3, fill: '#0F766E', strokeWidth: 0 }}
          activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
