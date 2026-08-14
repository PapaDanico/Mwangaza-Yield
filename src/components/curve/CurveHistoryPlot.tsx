'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

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
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e0d3" />
        <XAxis dataKey="tenor" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          domain={['dataMin - 1', 'dataMax + 1']}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <Tooltip
          formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]}
          labelFormatter={(l: string) => `${l} tenor`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {shown.map((row, i) => (
          <Line
            key={row.year}
            type="monotone"
            dataKey={String(row.year)}
            stroke={colours[i % colours.length]}
            strokeWidth={row.year === last ? 2.5 : 1.5}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
