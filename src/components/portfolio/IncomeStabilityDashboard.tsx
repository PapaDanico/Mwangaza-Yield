'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import {
  computeIncomeGaps,
  computeIncomeStabilityScore,
  computeMonthlyIncomeDistribution,
  suggestSwaps,
} from '@/lib/income-stability';

function scoreColor(score: number): string {
  if (score < 50) return 'text-red-700';
  if (score <= 75) return 'text-gold-700';
  return 'text-mint-700';
}

export default function IncomeStabilityDashboard() {
  const holdings = usePortfolioStore((s) => s.holdings);
  const bonds = useBondStore((s) => s.bonds);
  const [target, setTarget] = useState(50000);
  const [showSwaps, setShowSwaps] = useState(false);

  const enriched = useMemo(() => holdings.map((h) => ({
    holding: h,
    bond: bonds.find((b) => b.isin === h.isin || b.issueCode === h.issueCode) ?? null,
  })), [holdings, bonds]);

  const distribution = useMemo(() => computeMonthlyIncomeDistribution(enriched), [enriched]);
  const score = useMemo(() => computeIncomeStabilityScore(distribution), [distribution]);
  const gaps = useMemo(() => computeIncomeGaps(distribution, target), [distribution, target]);
  const swaps = useMemo(() => suggestSwaps(enriched, bonds, target), [enriched, bonds, target]);

  const chartData = distribution.map((value, i) => ({
    month: new Date(new Date().getFullYear(), new Date().getMonth() + i, 1).toLocaleDateString('en-KE', { month: 'short' }),
    income: value,
    target,
  }));

  const ladderData = useMemo(() =>
    enriched
      .filter((e) => e.bond)
      .map((e) => {
        const start = new Date();
        const end = new Date(e.bond!.maturityDate);
        const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
        return {
          issueCode: e.bond!.issueCode,
          months,
          coupon: e.bond!.couponRate,
        };
      })
      .slice(0, 12)
  , [enriched]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Income Stability</h2>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="income-target" className="text-ink-muted">Monthly target</label>
            <input
              id="income-target"
              type="number"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value) || 0)}
              className="num w-28 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[220px,1fr]">
          <div className="rounded-xl border border-sand-300 p-4 text-center">
            <p className="text-xs text-ink-muted">Stability score</p>
            <p className={`num mt-2 text-4xl font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</p>
            <p className="mt-1 text-xs text-ink-faint">0–100 (higher is smoother monthly income)</p>
            <button
              onClick={() => setShowSwaps((s) => !s)}
              className="mt-3 rounded-lg border border-sand-300 px-3 py-1.5 text-xs hover:bg-sand-100"
            >
              Smooth Income
            </button>
          </div>
          <div className="h-64 rounded-xl border border-sand-300 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="income" fill="#0B214A" />
                <Line dataKey="target" stroke="#B7791F" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {gaps.length > 0 && (
          <p className="mt-3 text-sm text-gold-800">{gaps.length} months are below target income.</p>
        )}

        {showSwaps && (
          <div className="mt-3 rounded-xl border border-sand-300 bg-sand-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Swap optimizer</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {swaps.length === 0 && <li>No immediate swap recommendation for this target.</li>}
              {swaps.map((s, i) => (
                <li key={`${s.issueCode}-${i}`}>{s.action.toUpperCase()} {s.issueCode}: {s.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-ink">Ladder Visualizer</h3>
        <p className="text-xs text-ink-muted">Months to maturity by bond (coupon intensity shown in tooltip).</p>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={ladderData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="issueCode" type="category" width={110} />
              <Tooltip />
              <Bar dataKey="months" fill="#0B214A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">Income Calendar</h3>
          <button
            onClick={() => setTarget((t) => t || 50000)}
            className="rounded-lg border border-sand-300 px-3 py-1 text-xs hover:bg-sand-100"
          >
            Set Target
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {chartData.map((m) => (
            <button key={m.month} className="rounded-lg border border-sand-300 p-2 text-left hover:bg-sand-100">
              <p className="text-xs text-ink-muted">{m.month}</p>
              <p className="num text-sm font-semibold text-ink">Ksh {m.income.toFixed(0)}</p>
              <p className="text-[11px] text-ink-faint">Target Ksh {target.toFixed(0)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-ink">Retirement Income Quick Goal</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Uses your current holdings to target inflation-aware monthly retirement cash flow. Start by setting a monthly target above.
        </p>
      </div>
    </div>
  );
}
