'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { APP_ROUTES, JOURNEY_STAGES } from '@/lib/routes';

function currentStageIndex(pathname: string): number {
  for (let i = 0; i < JOURNEY_STAGES.length; i++) {
    if (
      APP_ROUTES.some(
        (route) =>
          route.journeyStage === JOURNEY_STAGES[i]!.key &&
          pathname.startsWith(route.href.replace(/\/$/, ''))
      )
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Journey Progress Bar — a subtle top-stripe that shows where the user is in
 * the Discover → Analyze → Plan → Execute → Track flow.
 *
 * Deliberately low-contrast and unobtrusive. It annotates a position rather
 * than demanding attention — so it uses ink-faint labels and a thin stripe
 * rather than bright colours or large type.
 */
export default function JourneyBar() {
  const pathname = usePathname() ?? '/';
  const activeIdx = currentStageIndex(pathname);

  // Don't render on the root page or pages outside the journey map.
  if (activeIdx === -1) return null;

  const pct = ((activeIdx + 1) / JOURNEY_STAGES.length) * 100;

  return (
    <div
      className="no-print border-b border-sand-200 bg-sand-100"
      aria-label={`You are at the ${JOURNEY_STAGES[activeIdx]!.label} stage`}
    >
      {/* Progress stripe */}
      <div className="h-0.5 bg-sand-300">
        <div
          className="h-full bg-gold-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={activeIdx + 1}
          aria-valuemin={1}
          aria-valuemax={JOURNEY_STAGES.length}
        />
      </div>

      {/* Stage labels — scrollable on xs so they are never invisible */}
      <ol className="mx-auto flex max-w-6xl items-center gap-x-4 overflow-x-auto px-4 py-1.5 scrollbar-none">
        {JOURNEY_STAGES.map((stage, i) => {
          const isActive = i === activeIdx;
          const isPast = i < activeIdx;
          return (
            <li key={stage.label} className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  'text-[10px] font-medium tracking-wide',
                  isActive
                    ? 'text-gold-700'
                    : isPast
                      ? 'text-ink-muted'
                      : 'text-ink-faint',
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {stage.label}
              </span>
              {i < JOURNEY_STAGES.length - 1 && (
                <span className="text-[10px] text-ink-faint/50">›</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
