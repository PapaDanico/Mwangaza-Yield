'use client';

import { useState } from 'react';
import { Plus, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatKES } from '@/lib/financial-engine';
import { formatCompactKES } from '@/lib/utils';
import { buildProgress, projectPot, monthsBetween, type ProgressStatus } from '@/lib/progress';
import { withCheckpoint, withoutCheckpoint, type SavedPlan } from '@/lib/plans';

const TONE: Record<ProgressStatus, { label: string; cls: string; Icon: typeof TrendingUp }> = {
  ahead:      { label: 'Ahead of plan',  cls: 'bg-mint-500/15 text-mint-700',  Icon: TrendingUp },
  'on-track': { label: 'On track',       cls: 'bg-mint-500/15 text-mint-700',  Icon: Minus },
  behind:     { label: 'Behind plan',    cls: 'bg-gold-500/20 text-gold-700',  Icon: TrendingDown },
  'too-early':{ label: 'Nothing recorded yet', cls: 'bg-sand-200 text-ink-soft', Icon: Minus },
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Progress of a saved plan against the projection it was made with.
 *
 * Only rendered for goals that accumulate toward a target. Passive income and
 * capital preservation allocate money already held, so there is no trajectory
 * to be ahead of or behind, and inventing a progress bar for them would be
 * decoration pretending to be information.
 */
export default function GoalProgress({
  plan, targetKES, annualRatePct, startKES, monthlyKES, onChange,
}: {
  plan: SavedPlan;
  targetKES: number;
  annualRatePct: number;
  startKES: number;
  monthlyKES: number;
  onChange: (plan: SavedPlan) => void;
}) {
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState<number>(0);

  const progress = buildProgress(plan.checkpoints ?? [], {
    startedAt: plan.createdAt.slice(0, 10),
    startKES, monthlyKES, annualRatePct, targetKES,
  });
  const tone = TONE[progress.status];

  function record() {
    if (!(amount > 0)) return;
    onChange(withCheckpoint(plan, date, amount, new Date().toISOString()));
    setAmount(0);
  }

  // The planned curve, monthly, out to whichever is later: the last reading or
  // a year in. A chart that stops at the first reading has nothing to compare.
  const start = new Date(plan.createdAt.slice(0, 10));
  const lastDate = progress.latest ? new Date(progress.latest.date) : start;
  const span = Math.max(12, monthsBetween(start, lastDate) + 3);
  const curve = Array.from({ length: span + 1 }, (_, m) => ({
    m, value: projectPot(startKES, monthlyKES, annualRatePct, m),
  }));

  // 8% headroom, or the target line — always the highest thing on the chart —
  // is drawn on the top edge and its stroke is half clipped away.
  const maxY = 1.08 * (Math.max(
    targetKES,
    ...curve.map((p) => p.value),
    ...progress.points.map((p) => p.actualKES)
  ) || 1);
  const W = 100, H = 42;
  const x = (m: number) => (m / span) * W;
  const y = (v: number) => H - (v / maxY) * H;

  const plannedPath = curve.map((p) => `${x(p.m).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const actualPts = progress.points.map((p) => ({
    ...p, cx: x(monthsBetween(start, new Date(p.date))), cy: y(p.actualKES),
  }));

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">How {plan.name} is going</h2>
          <p className="text-xs text-ink-muted">
            Measured against the projection this plan was saved with, on{' '}
            {plan.createdAt.slice(0, 10)}.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${tone.cls}`}>
          <tone.Icon size={13} /> {tone.label}
        </span>
      </div>

      {/* One sentence carrying the whole answer, for anyone not seeing the chart. */}
      <p role="status" aria-live="polite" className="sr-only">
        {progress.latest
          ? `${plan.name}: ${tone.label}. Worth ${formatKES(progress.latest.actualKES)} against a plan of `
            + `${formatKES(progress.latest.plannedKES)} by ${progress.latest.date}, `
            + `${Math.round(progress.coverageRatio * 100)}% of the ${formatKES(targetKES)} target.`
          : `${plan.name}: nothing recorded yet.`}
      </p>

      {progress.latest && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <Stat label="Worth today" value={formatKES(progress.latest.actualKES)} />
          <Stat label="Plan said by now" value={formatKES(progress.latest.plannedKES)} />
          <Stat
            label={progress.latest.varianceKES >= 0 ? 'Ahead by' : 'Short by'}
            value={formatKES(Math.abs(progress.latest.varianceKES))}
            tone={progress.latest.varianceKES >= 0 ? 'good' : 'warn'}
          />
        </div>
      )}

      {/* Target coverage */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-ink-muted">
          <span>Toward {formatKES(targetKES)}</span>
          <span className="num">{Math.round(progress.coverageRatio * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand-200">
          <div
            className="h-full rounded-full bg-gold-500"
            style={{ width: `${Math.min(100, Math.max(0, progress.coverageRatio * 100))}%` }}
          />
        </div>
      </div>

      {progress.points.length > 0 && (
        <div>
        {/*
          preserveAspectRatio="none" so the plot fills the card. The default
          keeps the viewBox's own 100x42 ratio and letterboxes it, which on a
          wide card drew the whole chart in a narrow strip down the middle with
          empty space either side. Stretching distorts strokes, so the lines
          opt out with non-scaling-stroke and the reading markers are placed as
          positioned elements over the top, where a circle stays a circle.
        */}
        <div className="relative h-28 w-full">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
               className="h-full w-full" role="img"
               aria-label="Recorded value against the planned trajectory over time">
            <line x1="0" y1={y(targetKES)} x2={W} y2={y(targetKES)}
                  stroke="currentColor" strokeWidth="1" strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke" className="text-ink-faint" />
            <polyline points={plannedPath} fill="none" stroke="currentColor" strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke" className="text-ink-muted" />
            {actualPts.length > 1 && (
              <polyline points={actualPts.map((p) => `${p.cx.toFixed(2)},${p.cy.toFixed(2)}`).join(' ')}
                        fill="none" stroke="currentColor" strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke" className="text-gold-600" />
            )}
          </svg>
          {actualPts.map((p) => (
            <span
              key={p.date}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-600"
              style={{ left: `${(p.cx / W) * 100}%`, top: `${(p.cy / H) * 100}%` }}
            />
          ))}
        </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            <span><span className="text-gold-600">—</span> what you recorded</span>
            <span><span className="text-ink-muted">—</span> what the plan projected</span>
            <span><span className="text-ink-faint">- -</span> target {formatCompactKES(targetKES)}</span>
          </p>
        </div>
      )}

      {progress.revisedYearsToTarget !== null && (
        <p className="rounded-xl bg-sand-200 p-3 text-sm leading-relaxed text-ink-soft">
          At the pace of the last {progress.monthsObserved} months — about{' '}
          <span className="num font-semibold">
            {formatKES(Math.max(0, progress.observedMonthlyContributionKES ?? 0))}
          </span>{' '}
          a month going in — you reach {formatCompactKES(targetKES)} in{' '}
          <span className="num font-semibold text-gold-700">
            {progress.revisedYearsToTarget.toFixed(1)} years
          </span>
          .
        </p>
      )}

      {/* Record a reading */}
      <div className="border-t border-sand-300 pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="cp-date" className="mb-1 block text-xs font-medium text-ink-soft">
              As at
            </label>
            <input
              id="cp-date" type="date" value={date} max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2 text-sm text-ink outline-none focus:border-gold-500"
            />
          </div>
          <div className="min-w-0 flex-[1.4]">
            <label htmlFor="cp-amount" className="mb-1 block text-xs font-medium text-ink-soft">
              What it is worth (KES)
            </label>
            <input
              id="cp-amount" type="number" min={0} step={10_000}
              value={amount || ''} placeholder="0"
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && record()}
              className="num w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2 text-sm text-ink outline-none focus:border-gold-500"
            />
          </div>
          <button
            onClick={record}
            disabled={!(amount > 0)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-treasury-navy px-3 py-2 text-sm font-medium text-sand-50 transition hover:bg-treasury-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={15} /> Record
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          One figure, whenever you think of it — the total your bonds and cash are worth that day.
          It stays on this device with everything else.
        </p>
      </div>

      {progress.points.length > 0 && (
        <ul className="space-y-1">
          {[...progress.points].reverse().map((p) => (
            <li key={p.date} className="flex items-center justify-between gap-2 border-b border-sand-300/60 py-1.5 text-sm last:border-0">
              <span className="num text-ink-muted">{p.date}</span>
              <span className="num flex-1 text-right font-medium text-ink">{formatKES(p.actualKES)}</span>
              <span className={`num w-28 text-right text-xs ${p.varianceKES >= 0 ? 'text-mint-700' : 'text-gold-700'}`}>
                {p.varianceKES >= 0 ? '+' : '−'}{formatCompactKES(Math.abs(p.varianceKES))}
              </span>
              <button
                onClick={() => onChange(withoutCheckpoint(plan, p.date, new Date().toISOString()))}
                aria-label={`Remove the reading for ${p.date}`}
                className="rounded-lg p-1 text-ink-faint transition hover:bg-sand-200 hover:text-ink"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl bg-sand-200 p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`num mt-0.5 truncate font-semibold ${
        tone === 'good' ? 'text-mint-700' : tone === 'warn' ? 'text-gold-700' : 'text-ink'
      }`}>
        {value}
      </p>
    </div>
  );
}
