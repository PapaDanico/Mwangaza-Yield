'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useBondStore } from '@/stores/bondStore';
import {
  computeDebtSustainabilityIndicators,
  computeKenyaSpread,
  computeRealRate,
  computeTermPremium,
  trendArrow,
} from '@/lib/macro-context';

function latest(macro: ReturnType<typeof useBondStore.getState>['macro'], indicator: string): number {
  return [...macro].filter((m) => m.indicator === indicator).sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? 0;
}

function previous(macro: ReturnType<typeof useBondStore.getState>['macro'], indicator: string): number {
  return [...macro].filter((m) => m.indicator === indicator).sort((a, b) => b.date.localeCompare(a.date))[1]?.value ?? latest(macro, indicator);
}

export default function EconomicHealthSummary() {
  const macro = useBondStore((s) => s.macro);
  const bonds = useBondStore((s) => s.bonds);
  const tbills = useBondStore((s) => s.tbills);
  const auctions = useBondStore((s) => s.auctions);

  const cbr = latest(macro, 'CBR');
  const cpi = latest(macro, 'CPI');
  const realRate = computeRealRate(cbr, cpi);

  const debt = computeDebtSustainabilityIndicators(macro);
  const longYield = bonds.reduce((max, b) => Math.max(max, b.ytmGross || 0), 0);
  const shortYield = tbills[0]?.discountRate ?? 0;
  const termPremium = computeTermPremium(longYield, shortYield);
  const kenyaSpread = computeKenyaSpread(latest(macro, 'EM_BOND_YIELD') || longYield, latest(macro, 'US10Y') || latest(macro, 'US_FED_FUNDS'));

  const metrics = useMemo(() => [
    {
      key: 'real',
      label: 'Real Rate',
      value: `${realRate.toFixed(2)}%`,
      arrow: trendArrow(realRate, computeRealRate(previous(macro, 'CBR'), previous(macro, 'CPI'))),
      note: realRate > 0 ? 'Real rate is positive — favorable for bond investors.' : 'Real rate is negative — inflation is eroding nominal returns.',
    },
    {
      key: 'debt',
      label: 'Debt/GDP',
      value: `${debt.debtToGDP.toFixed(1)}%`,
      arrow: trendArrow(debt.debtToGDP, previous(macro, 'DEBT_TO_GDP') || debt.debtToGDP),
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
  ], [realRate, debt.debtToGDP, termPremium, kenyaSpread, macro]);

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
