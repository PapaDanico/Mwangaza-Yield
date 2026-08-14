'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

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
export default function YieldCurvePlot({ data }: { data: CurvePoint[] }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="tenor" type="number" domain={['dataMin', 'dataMax']}
          tick={{ fill: '#8B8676', fontSize: 12 }} stroke="#CBBD9C"
          tickFormatter={(t) => `${t}y`}
        />
        <YAxis
          tick={{ fill: '#8B8676', fontSize: 12 }} stroke="#CBBD9C"
          tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={60} domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{ background: '#FDFBF5', border: '1px solid #E3D8BE', borderRadius: 12, color: '#0A192F' }}
          labelStyle={{ color: '#8B8676' }}
          formatter={(v: number, name) => [`${v.toFixed(2)}%`, name]}
          labelFormatter={(t) => `${t}-year bond`}
        />
        <Legend
          formatter={(v) => <span style={{ color: '#31445F', fontSize: 12 }}>{v}</span>}
          iconType="plainline"
        />
        <Line
          name="Regular bonds (before tax)" type="monotone" dataKey="fxd" stroke="#D97706" strokeWidth={2.5}
          dot={{ r: 4, fill: '#D97706', strokeWidth: 0 }}
          activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
          connectNulls
        />
        <Line
          name="Infrastructure bonds (tax-free)" type="monotone" dataKey="ifb" stroke="#059669" strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 4, fill: '#059669', strokeWidth: 0 }}
          activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
