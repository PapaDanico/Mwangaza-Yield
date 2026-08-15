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
        {/* THE SWATCH CARRIES THE COLOUR, THE TEXT CARRIES THE LABEL.
            Recharts colours legend text to match its series, which put the
            three lightest years of the ramp on near-white at 1.43:1, 2.05:1
            and 2.48:1 — a year label nobody can read is not a legend entry.
            Darkening the ramp itself would flatten the light-to-dark ordering
            that makes recent years the most saturated, so the line keeps its
            colour and only the text is forced to ink. The swatch beside each
            label still does the identifying, which is what it is for. */}
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => <span style={{ color: '#2A2118' }}>{value}</span>}
        />
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
