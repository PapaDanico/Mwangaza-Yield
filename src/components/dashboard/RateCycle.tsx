'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { analyseCycle, recentDecisions, describeCycle, whatItMeans, phaseLabel, monthYear } from '@/lib/rate-cycle';
import { cn } from '@/lib/utils';
import Term from '@/components/shared/Term';

const RANGES = [
  { label: '2y', years: 2 },
  { label: '5y', years: 5 },
  { label: 'All', years: 100 },
];

const PHASE_STYLE = {
  easing: 'bg-mint-600',
  tightening: 'bg-gold-600',
  holding: 'bg-slate-500',
} as const;

const MOVE_ICON = { cut: ArrowDownRight, hike: ArrowUpRight, hold: Minus, start: Minus };
const MOVE_STYLE = {
  cut: 'text-mint-700',
  hike: 'text-gold-700',
  hold: 'text-ink-muted',
  start: 'text-ink-muted',
};

/**
 * The Central Bank Rate as a path, not a number.
 *
 * Every yield in this app is priced off the policy rate. Showing "8.75%" alone
 * hides the thing that actually informs a ten-year decision: that the rate has
 * come down from 18% and has now stopped falling. Each point links to CBK's
 * own press release, so the user can check us.
 */
export default function RateCycle() {
  const cbrHistory = useBondStore((s) => s.cbrHistory);
  const [years, setYears] = useState(5);

  const cycle = useMemo(() => analyseCycle(cbrHistory), [cbrHistory]);
  const series = useMemo(
    () => recentDecisions(cbrHistory, years).map((d) => ({ ...d, label: d.date.slice(0, 7) })),
    [cbrHistory, years],
  );

  if (!cycle || series.length < 2) return null;

  const recent = [...cbrHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const fell = cycle.runBps < 0;

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Which way interest rates are moving</h2>
          <p className="text-xs text-ink-faint">
            The <Term slug="central-bank-rate">Central Bank Rate</Term> sets the tone for every
            other rate in Kenya · {cbrHistory.length} decisions since{' '}
            {cbrHistory[0]?.date.slice(0, 4)}
          </p>
        </div>
        <div className="flex rounded-lg border border-sand-300 bg-sand-100 p-0.5" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setYears(r.years)}
              aria-pressed={years === r.years}
              className={cn(
                // min-h/min-w bring the chip to a 44px target without changing
                // its visual weight — at 32x25 it was well under half the
                // recommended minimum, on the segmented control readers use most.
                'min-h-[44px] min-w-[44px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                years === r.years ? 'bg-sand-50 text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <span
            className={cn(
              'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sand-50',
              PHASE_STYLE[cycle.phase],
            )}
          >
            {phaseLabel(cycle.phase)}
          </span>
          <p className="num mt-1.5 text-3xl font-bold leading-none text-ink">
            {cycle.current.toFixed(2)}
            <span className="ml-1 text-lg font-normal text-ink-muted">%</span>
          </p>
        </div>
        <div className="text-xs text-ink-muted">
          <p>
            <span className={cn('num font-bold', fell ? 'text-mint-700' : 'text-gold-700')}>
              {fell ? '−' : '+'}
              {(Math.abs(cycle.runBps) / 100).toFixed(2)} pp
            </span>{' '}
            from {cycle.cycleStart.toFixed(2)}% this cycle
          </p>
          <p className="mt-0.5">Set {cycle.currentDate}</p>
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label" tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C"
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C"
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={52} domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#FDFBF5', border: '1px solid #E3D8BE', borderRadius: 12, color: '#0A192F' }}
              labelStyle={{ color: '#8B8676' }}
              formatter={(v: number) => [`${v.toFixed(2)}%`, 'Central Bank Rate']}
              labelFormatter={(l, p) => p?.[0]?.payload?.date ?? l}
            />
            <ReferenceLine
              y={cycle.current} stroke="#CBBD9C" strokeDasharray="4 4"
            />
            {/* A step line, because the rate genuinely holds flat between
                meetings — a smooth curve would imply movement that never
                happened. */}
            <Line
              type="stepAfter" dataKey="rate" stroke="#D97706" strokeWidth={2.5}
              dot={{ r: 3, fill: '#D97706', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        Record high {cycle.recordHigh.toFixed(2)}% ({monthYear(cycle.recordHighDate)}) · record low{' '}
        {cycle.recordLow.toFixed(2)}% ({monthYear(cycle.recordLowDate)}) — separate cycles, shown for
        scale rather than comparison.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeCycle(cycle)}</p>
      <div className="mt-3 rounded-xl border border-sand-300 bg-sand-100 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          What this means for you
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{whatItMeans(cycle)}</p>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Recent decisions
        </p>
        <ul className="space-y-0.5">
          {recent.map((d) => {
            const Icon = MOVE_ICON[d.move];
            return (
              <li key={d.id}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={d.title}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-sand-100"
                >
                  <Icon size={13} className={cn('shrink-0', MOVE_STYLE[d.move])} />
                  <span className="num shrink-0 tabular-nums text-ink-muted">{d.date}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">
                    {d.move === 'hold'
                      ? `Held at ${d.rate.toFixed(2)}%`
                      : d.move === 'start'
                        ? `Rate published at ${d.rate.toFixed(2)}%`
                        : `${d.move === 'cut' ? 'Cut' : 'Raised'} ${Math.abs(d.changeBps)}bps to ${d.rate.toFixed(2)}%`}
                  </span>
                  <ExternalLink size={11} className="shrink-0 text-ink-faint" />
                </a>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-ink-faint">
          Source: CBK Monetary Policy Committee press releases. Each row links to the original.
        </p>
      </div>
    </div>
  );
}
