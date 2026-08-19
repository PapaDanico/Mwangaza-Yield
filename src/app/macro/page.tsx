'use client';

import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { useBondStore } from '@/stores/bondStore';
import {
  computeDebtSustainabilityIndicators,
  computeKenyaSpread,
  computeRealRate,
  computeTermPremium,
  sustainabilitySignal,
} from '@/lib/macro-context';

function latest(m: ReturnType<typeof useBondStore.getState>['macro'], indicator: string): number {
  return [...m]
    .filter((x) => x.indicator === indicator)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? 0;
}

function mpcSentiment(title?: string): 'hawkish' | 'dovish' | 'neutral' {
  const t = (title || '').toLowerCase();
  if (t.includes('raise') || t.includes('hike') || t.includes('tight')) return 'hawkish';
  if (t.includes('cut') || t.includes('ease')) return 'dovish';
  return 'neutral';
}

export default function MacroPage() {
  const macro = useBondStore((s) => s.macro);
  const cbrHistory = useBondStore((s) => s.cbrHistory);
  const bonds = useBondStore((s) => s.bonds);
  const tbills = useBondStore((s) => s.tbills);

  const [expectedDecision, setExpectedDecision] = useState('');

  const cbr = latest(macro, 'CBR');
  const cpi = latest(macro, 'CPI');
  const fx = latest(macro, 'FX_USD_KES');
  const us10y = latest(macro, 'US10Y');
  const fed = latest(macro, 'US_FED_FUNDS');
  const em = latest(macro, 'EM_BOND_YIELD');
  const longYield = bonds.reduce((max, b) => Math.max(max, b.ytmGross || 0), 0);
  const shortYield = tbills[0]?.discountRate ?? 0;

  const realRate = computeRealRate(cbr, cpi);
  const termPremium = computeTermPremium(longYield, shortYield);
  const kenyaSpread = computeKenyaSpread(em || longYield, us10y || fed);

  const debt = computeDebtSustainabilityIndicators(macro);
  const sustainability = sustainabilitySignal(debt.debtToGDP, debt.debtServiceRatio);

  const cbrSeries = useMemo(
    () => [...cbrHistory].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ date: d.date.slice(0, 7), rate: d.rate, move: d.move })),
    [cbrHistory],
  );

  const debtSeries = useMemo(() => {
    const debtRows = macro.filter((m) => m.indicator === 'DEBT_TO_GDP').sort((a, b) => a.date.localeCompare(b.date));
    if (debtRows.length) return debtRows.map((m) => ({ date: m.date.slice(0, 4), value: m.value }));
    return [{ date: 'Now', value: debt.debtToGDP }];
  }, [macro, debt.debtToGDP]);

  const spillovers = [
    { label: 'USD/KES', value: fx },
    { label: 'Fed Funds', value: fed },
    { label: 'EM Yield', value: em },
    { label: 'KE Spread', value: kenyaSpread },
  ];

  const latestDecision = [...cbrHistory].sort((a, b) => b.date.localeCompare(a.date))[0];
  const sentiment = mpcSentiment(latestDecision?.title);

  const upcomingMpc = useMemo(() => {
    const sorted = [...cbrHistory].sort((a, b) => b.date.localeCompare(a.date));
    const latestDate = new Date(sorted[0]?.date ?? new Date().toISOString());
    const meetings: Date[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const d = new Date(latestDate);
      d.setDate(d.getDate() + 60 * i);
      meetings.push(d);
    }
    return meetings;
  }, [cbrHistory]);

  const now = new Date();

  return (
    <div className="macro-newspaper space-y-6 rounded-2xl p-4 sm:p-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Economic Context</h1>
        <p className="text-sm text-ink-muted">Monetary policy, fiscal health, global spillovers, and market context in one view.</p>
      </div>

      <section className="card">
        <h2 className="font-semibold text-ink">Monetary Policy</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cbrSeries}>
              <XAxis dataKey="date" hide />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip />
              <Line type="monotone" dataKey="rate" stroke="#0B214A" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 text-xs text-ink-faint">
          {cbrSeries.slice(-5).map((p) => (
            <li key={p.date}>{p.date}: {p.rate.toFixed(2)}%</li>
          ))}
        </ul>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Real rate gauge</p>
            <p className="num text-xl font-bold text-ink">{realRate.toFixed(2)}%</p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Latest MPC sentiment</p>
            <p className="font-semibold capitalize text-ink">{sentiment}</p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Current CBR</p>
            <p className="num text-xl font-bold text-ink">{cbr.toFixed(2)}%</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold text-ink">Fiscal Health</h2>
        <div className="mt-3 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={debtSeries}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#B7791F" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 text-xs text-ink-faint">
          {debtSeries.slice(-5).map((p) => (
            <li key={p.date}>{p.date}: {p.value.toFixed(1)}%</li>
          ))}
        </ul>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div><p className="text-xs text-ink-muted">Debt / GDP</p><p className="num font-bold">{debt.debtToGDP.toFixed(1)}%</p></div>
          <div><p className="text-xs text-ink-muted">Debt service ratio</p><p className="num font-bold">{debt.debtServiceRatio.toFixed(1)}%</p></div>
          <div><p className="text-xs text-ink-muted">Fiscal space</p><p className="num font-bold">{debt.fiscalSpace.toFixed(1)}</p></div>
          <div>
            <p className="text-xs text-ink-muted">Sustainability</p>
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${sustainability === 'green' ? 'bg-mint-500/15 text-mint-700' : sustainability === 'yellow' ? 'bg-gold-500/15 text-gold-700' : 'bg-red-500/15 text-red-700'}`}>
              {sustainability}
            </span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold text-ink">Global Spillovers</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {spillovers.map((s) => (
            <div key={s.label} className="rounded-xl border border-sand-300 p-3">
              <p className="text-xs text-ink-muted">{s.label}</p>
              <p className="num text-lg font-bold text-ink">{s.value.toFixed(2)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold text-ink">Market Context</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Term premium</p>
            <p className="num text-xl font-bold text-ink">{termPremium.toFixed(2)}%</p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Yield curve shape (sample)</p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bonds.slice(0, 8).map((b) => ({ code: b.issueCode.split('/').pop(), y: b.ytmGross }))}>
                  <XAxis dataKey="code" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="y" fill="#0B214A" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold text-ink">MPC Calendar</h2>
        <div className="mt-3 space-y-2">
          {upcomingMpc.map((d) => {
            const days = Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
            return (
              <div key={d.toISOString()} className="flex items-center justify-between rounded-xl border border-sand-300 p-3 text-sm">
                <span>{d.toLocaleDateString('en-KE', { dateStyle: 'medium' })}</span>
                <span className="num text-ink-soft">{days} days</span>
              </div>
            );
          })}
        </div>
        <label htmlFor="mpc-exp" className="mt-3 block text-xs text-ink-muted">Expected Decision (your note)</label>
        <input
          id="mpc-exp"
          value={expectedDecision}
          onChange={(e) => setExpectedDecision(e.target.value)}
          placeholder="e.g. Hold at current rate"
          className="mt-1 w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm text-ink"
        />
      </section>
    </div>
  );
}
