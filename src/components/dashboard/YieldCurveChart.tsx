'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useBondStore } from '@/stores/bondStore';
import type { Bond } from '@/types/bond';

export default function YieldCurveChart() {
  const bonds = useBondStore((s) => s.bonds);

  // One point per tenor per family; reopens keep the most recent issue.
  const pick = (pool: Bond[]) => {
    const byTenor = new Map<number, Bond>();
    for (const b of pool) {
      const prev = byTenor.get(b.tenorYears);
      if (!prev || b.issueDate > prev.issueDate) byTenor.set(b.tenorYears, b);
    }
    return Array.from(byTenor.values());
  };
  const fxd = pick(bonds.filter((b) => !b.taxExempt));
  const ifb = pick(bonds.filter((b) => b.taxExempt));

  const points = new Map<number, { tenor: number; fxd?: number; ifb?: number; code: string }>();
  for (const b of fxd) points.set(b.tenorYears, { tenor: b.tenorYears, fxd: b.ytmGross, code: b.issueCode });
  for (const b of ifb) {
    const p = points.get(b.tenorYears) ?? { tenor: b.tenorYears, code: b.issueCode };
    // IFBs are WHT-exempt, so gross = net.
    points.set(b.tenorYears, { ...p, ifb: b.ytmGross, code: p.fxd ? p.code : b.issueCode });
  }
  const data = Array.from(points.values()).sort((a, b) => a.tenor - b.tenor);

  if (!data.length) return <div className="card h-72 animate-pulse" />;

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold text-ink">Kenya Sovereign Yield Curve</h2>
      <p className="mb-4 text-xs text-ink-faint">Gross YTM by tenor · IFB series is net (tax-free)</p>
      <div className="h-64">
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
              labelFormatter={(t) => `${t}-year tenor`}
            />
            <Legend
              formatter={(v) => <span style={{ color: '#31445F', fontSize: 12 }}>{v}</span>}
              iconType="plainline"
            />
            <Line
              name="Benchmark (FXD, gross)" type="monotone" dataKey="fxd" stroke="#D97706" strokeWidth={2.5}
              dot={{ r: 4, fill: '#D97706', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
              connectNulls
            />
            <Line
              name="IFB net (tax-free)" type="monotone" dataKey="ifb" stroke="#059669" strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 4, fill: '#059669', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
