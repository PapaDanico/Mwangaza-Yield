'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

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
export default function RateCyclePlot({
  series,
  current,
}: {
  series: RatePoint[];
  current: number;
}) {
  return (
    <ResponsiveContainer>
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label" tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C"
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C"
          tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={52} domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{ background: '#FDFBF5', border: '1px solid #E3D8BE', borderRadius: 12, color: '#0A192F' }}
          labelStyle={{ color: '#8B8676' }}
          formatter={(v: number) => [`${v.toFixed(2)}%`, 'Central Bank Rate']}
          labelFormatter={(l, p) => p?.[0]?.payload?.date ?? l}
        />
        <ReferenceLine y={current} stroke="#CBBD9C" strokeDasharray="4 4" />
        {/* A step line, because the rate genuinely holds flat between
            meetings — a smooth curve would imply movement that never
            happened. */}
        <Line
          type="stepAfter" dataKey="rate" stroke="#D97706" strokeWidth={2.5}
          dot={{ r: 3, fill: '#D97706', strokeWidth: 0 }}
          activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
