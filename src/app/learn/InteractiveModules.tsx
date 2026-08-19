'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { PlayCircle, CheckCircle2 } from 'lucide-react';

const YieldCurvePlayground = lazy(() => import('@/components/learn/YieldCurvePlayground'));
const DurationVisualizer   = lazy(() => import('@/components/learn/DurationVisualizer'));
const TaxImpactExplorer    = lazy(() => import('@/components/learn/TaxImpactExplorer'));
const LadderingDemo        = lazy(() => import('@/components/learn/LadderingDemo'));

const MODULES = [
  {
    id: 'yield-curve',
    title: 'Yield Curve Playground',
    desc: 'Drag yield points and watch bond prices respond in real time.',
    badge: 'Start here',
    badgeClass: 'bg-mint-500/15 text-mint-700',
    Component: YieldCurvePlayground,
  },
  {
    id: 'duration',
    title: 'Duration Visualizer',
    desc: 'See why long bonds lose more when rates rise — and why high coupons help.',
    badge: 'Advanced',
    badgeClass: 'bg-gold-100 text-gold-800',
    Component: DurationVisualizer,
  },
  {
    id: 'tax',
    title: 'Tax Impact Explorer',
    desc: 'Compare what you actually keep from an IFB vs a taxable bond.',
    badge: null,
    badgeClass: '',
    Component: TaxImpactExplorer,
  },
  {
    id: 'laddering',
    title: 'The Power of Laddering',
    desc: 'Build a ladder interactively and watch your cash-flow calendar fill up.',
    badge: null,
    badgeClass: '',
    Component: LadderingDemo,
  },
] as const;

type ModuleId = (typeof MODULES)[number]['id'];

const LS_KEY = 'mwangaza:learn:completed';

function loadCompleted(): Set<ModuleId> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as ModuleId[]);
  } catch {
    return new Set();
  }
}

function saveCompleted(set: Set<ModuleId>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch { /* no-op */ }
}

/** Ring progress indicator — pure SVG, no external library. */
function ProgressRing({ done, total, size = 36 }: { done: number; total: number; size?: number }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = total === 0 ? 0 : done / total;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#CBBD9C" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={progress === 1 ? '#10b981' : '#D97706'}
        strokeWidth={3}
        strokeDasharray={`${circumference * progress} ${circumference * (1 - progress)}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function InteractiveModules() {
  const [completed, setCompleted] = useState<Set<ModuleId>>(new Set());
  const [active, setActive] = useState<ModuleId | null>(null);

  useEffect(() => { setCompleted(loadCompleted()); }, []);

  function markDone(id: ModuleId) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveCompleted(next);
      return next;
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Interactive Modules</h2>
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <ProgressRing done={completed.size} total={MODULES.length} />
          <span>{completed.size}/{MODULES.length} completed</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODULES.map(({ id, title, desc, badge, badgeClass, Component }) => {
          const isDone = completed.has(id);
          const isOpen = active === id;
          return (
            <div key={id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display font-semibold text-ink">{title}</h3>
                    {badge && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-soft">{desc}</p>
                </div>
                {isDone && <CheckCircle2 size={18} className="shrink-0 text-mint-700" />}
              </div>

              <button
                onClick={() => setActive(isOpen ? null : id)}
                className="flex min-h-[36px] items-center gap-1.5 text-sm font-medium text-gold-700 underline-offset-2 hover:underline"
              >
                <PlayCircle size={15} />
                {isOpen ? 'Collapse' : isDone ? 'Revisit' : 'Start module'}
              </button>

              {isOpen && (
                <div className="border-t border-sand-200 pt-3">
                  <Suspense fallback={
                    <div className="h-48 animate-pulse rounded-xl bg-sand-200" aria-label="Loading module" />
                  }>
                    <Component />
                  </Suspense>
                  {!isDone && (
                    <button
                      onClick={() => markDone(id)}
                      className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-mint-700 hover:underline underline-offset-2"
                    >
                      <CheckCircle2 size={14} /> Mark as complete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
