'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useBondStore } from '@/stores/bondStore';
import Term from '@/components/shared/Term';
import type { Bond } from '@/types/bond';
import DataState from '@/components/shared/DataState';

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

  if (!data.length) return <DataState />;

  // Describe the SHAPE in words, because the shape is the point and most
  // readers have never been told what to look for. Derived from the two ends
  // of the taxable curve — the comparison a saver is actually making.
  const withYield = data.filter((d) => d.fxd != null);
  const short = withYield[0];
  const long = withYield[withYield.length - 1];
  const spread = short && long && short !== long ? long.fxd! - short.fxd! : null;
  const shape =
    spread == null
      ? null
      : spread > 1.5
        ? {
            label: 'Steep',
            text: `Long loans pay noticeably more than short ones — about ${spread.toFixed(2)} percentage points more over ${long.tenor - short.tenor} extra years. You are being paid well to commit for longer.`,
          }
        : spread > 0.4
          ? {
              label: 'Gently rising',
              text: `Longer bonds pay a little more — roughly ${spread.toFixed(2)} percentage points across ${long.tenor - short.tenor} extra years. Worth weighing that against how long you can leave the money alone.`,
            }
          : spread >= -0.4
            ? {
                label: 'Flat',
                text: 'Long bonds pay barely more than short ones. There is little reward for tying your money up, so shorter maturities are doing much the same work with more freedom.',
              }
            : {
                label: 'Inverted',
                text: 'Short bonds are paying MORE than long ones — unusual, and typically a sign the market expects rates to fall. Locking in a long bond now is a bet on exactly that.',
              };

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold text-ink">
        What the government pays for different loan lengths
      </h2>
      <p className="mb-4 text-xs text-ink-faint">
        Bankers call this the <Term slug="yield-curve">yield curve</Term>. Each dot is one bond:
        how many years it runs, and what it pays.
      </p>
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
      </div>

      {shape && (
        <div className="mt-4 rounded-xl border border-sand-300 bg-sand-100 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            How to read this · {shape.label}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{shape.text}</p>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        The green line sits lower but is <Term slug="withholding-tax">tax-free</Term>, so compare it
        against the gold line <em>after</em> tax rather than side by side. The{' '}
        <a href="/calculator/" className="text-gold-700 hover:underline">calculator</a> does that for
        a specific amount.
      </p>
    </div>
  );
}
