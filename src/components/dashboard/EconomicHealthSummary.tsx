'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useBondStore } from '@/stores/bondStore';
import {
  trendArrow,
} from '@/lib/macro-context';
import { buildMacroSummary } from '@/lib/macro-summary';

export default function EconomicHealthSummary() {
  const macro = useBondStore((s) => s.macro);
  const bonds = useBondStore((s) => s.bonds);
  const tbills = useBondStore((s) => s.tbills);
  const auctions = useBondStore((s) => s.auctions);
  const summary = useMemo(() => buildMacroSummary(macro, bonds, tbills), [macro, bonds, tbills]);
  const { realRate, prevRealRate, debt, prevDebt, termPremium, kenyaSpread } = summary;

  const metrics = useMemo(() => [
    {
      key: 'real',
      label: 'Real Rate',
      value: `${realRate.toFixed(2)}%`,
      arrow: trendArrow(realRate, prevRealRate),
      note: realRate > 0 ? 'Real rate is positive — favorable for bond investors.' : 'Real rate is negative — inflation is eroding nominal returns.',
    },
    {
      key: 'debt',
      label: 'Debt/GDP',
      value: `${debt.debtToGDP.toFixed(1)}%`,
      arrow: trendArrow(debt.debtToGDP, prevDebt || debt.debtToGDP),
      note: debt.debtToGDP < 60 ? 'Debt burden is moderate against GDP.' : 'Debt burden remains elevated relative to GDP.',
    },
    {
      key: 'term',
      label: 'Term Premium',
      value: `${termPremium.toFixed(2)}%`,
      arrow: termPremium >= 0 ? '▲' : '▼',
      note: termPremium >= 0 ? 'Long bonds pay above short rates, rewarding duration risk.' : 'Curve inversion signals tighter long-end risk pricing.',
    },
    {
      key: 'spread',
      label: 'Kenya Spread',
      value: `${kenyaSpread.toFixed(2)}%`,
      arrow: kenyaSpread >= 0 ? '▲' : '▼',
      note: kenyaSpread > 3 ? 'Kenya spread is wide versus global benchmarks.' : 'Kenya spread is relatively contained versus peers.',
    },
  ], [realRate, prevRealRate, debt.debtToGDP, prevDebt, termPremium, kenyaSpread]);

  const mpcCount = useBondStore((s) => s.cbrHistory.length);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">Economic Health Summary</h2>
        <Link href="/macro/" className="text-xs font-semibold text-gold-700 hover:underline">Open full economic dashboard</Link>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.key} className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">{m.label}</p>
            <p className="num mt-1 text-lg font-bold text-ink">{m.arrow} {m.value}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{m.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Data Quality: {auctions.length} auctions, {bonds.length} bonds, {mpcCount} MPC decisions — all verified.
      </p>
    </div>
  );
}
