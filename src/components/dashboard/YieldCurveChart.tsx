'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useBondStore } from '@/stores/bondStore';

export default function YieldCurveChart() {
  const bonds = useBondStore((s) => s.bonds);
  const data = bonds
    .filter((b) => !b.taxExempt) // FXD curve — IFBs price off a tax-free curve
    .map((b) => ({ tenor: b.tenorYears, ytm: b.ytmGross, code: b.issueCode }))
    .sort((a, b) => a.tenor - b.tenor);

  if (!data.length) return <div className="card h-72 animate-pulse" />;

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold text-white">Government Yield Curve</h2>
      <p className="mb-4 text-xs text-slate-400">Gross YTM by tenor, latest FXD issues</p>
      <div className="h-64">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="tenor" type="number" domain={['dataMin', 'dataMax']}
              tick={{ fill: '#94A3B8', fontSize: 12 }} stroke="#334155"
              tickFormatter={(t) => `${t}y`}
            />
            <YAxis
              tick={{ fill: '#94A3B8', fontSize: 12 }} stroke="#334155"
              tickFormatter={(v) => `${v}%`} width={48} domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#0A192F', border: '1px solid #334155', borderRadius: 12 }}
              labelStyle={{ color: '#94A3B8' }}
              formatter={(v: number, _n, p) => [`${v.toFixed(2)}% — ${p.payload.code}`, 'Gross YTM']}
              labelFormatter={(t) => `${t}-year tenor`}
            />
            <Line
              type="monotone" dataKey="ytm" stroke="#F59E0B" strokeWidth={2}
              dot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#0A192F', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
