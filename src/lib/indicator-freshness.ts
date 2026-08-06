/**
 * Whether a single headline figure is as current as its publisher's cadence
 * says it should be.
 *
 * WHY THE EXISTING SURFACES DO NOT COVER THIS
 * -------------------------------------------
 * `StaleDataNotice` warns when the whole pipeline has stopped. `healthcheck.py`
 * now holds each indicator to its own budget. Neither helps the reader looking
 * at the dashboard while the pipeline runs perfectly and ONE figure has rotted.
 *
 * That was the shipped state: USD/KES dated 2026-07-20 sat beside a CPI from
 * yesterday, both rendered identically, on a page whose whole promise is the
 * latest available information. The card does print `source · date` — but
 * behind `hidden sm:block`, so on a 390px phone, which is most of this
 * audience, the date was not shown at all. The one number that had stopped
 * moving was the one presented with the least context.
 *
 * WHY THE BUDGETS ARE A COPY, AND WHAT STOPS IT DRIFTING
 * -----------------------------------------------------
 * The authoritative list is PER_INDICATOR_BUDGETS in healthcheck.py, which the
 * pipeline enforces. Python cannot be imported here, so this is a copy — and a
 * copy is a thing that goes out of date, exactly like the cron expression in
 * data-freshness.ts. `indicator-budgets-match-healthcheck.test.ts` parses the
 * Python and fails if the two ever diverge, which is the same guard applied to
 * the same class of problem.
 */

export interface IndicatorBudget {
  /** Days before the figure should be treated as out of date. */
  days: number;
  /** Why that number — shown to the reader, so it must read as a reason. */
  cadence: string;
}

/** Mirrors PER_INDICATOR_BUDGETS in backend/scrapers/healthcheck.py. */
export const INDICATOR_BUDGETS: Record<string, IndicatorBudget> = {
  FX_USD_KES: { days: 4, cadence: 'published every trading day' },
  CPI: { days: 45, cadence: 'released monthly' },
  CPI_CORE: { days: 45, cadence: 'released monthly' },
  CPI_NONCORE: { days: 45, cadence: 'released monthly' },
  CBR: { days: 130, cadence: 'set at MPC meetings, roughly every two months' },
};

/**
 * Fallback for an indicator with no declared budget.
 *
 * Conservative rather than exempt: an unlisted indicator should be visible if
 * it rots, not silently trusted forever. Matches the Python fallback.
 */
export const DEFAULT_BUDGET_DAYS = 40;

export interface IndicatorAge {
  days: number;
  budgetDays: number;
  stale: boolean;
  cadence: string;
}

export function indicatorAge(
  indicator: string,
  date: string,
  now: Date = new Date()
): IndicatorAge | null {
  const when = new Date(date);
  if (Number.isNaN(when.getTime())) return null;
  const budget = INDICATOR_BUDGETS[indicator];
  const budgetDays = budget?.days ?? DEFAULT_BUDGET_DAYS;
  const days = Math.floor((now.getTime() - when.getTime()) / 86_400_000);
  // A future date is not staleness. Clamping to 0 rather than reporting a
  // negative age keeps a clock-skewed device from showing nonsense.
  const age = Math.max(0, days);
  return {
    days: age,
    budgetDays,
    stale: age > budgetDays,
    cadence: budget?.cadence ?? 'no stated cadence',
  };
}

/**
 * The sentence shown under a stale figure, or null when there is nothing to
 * say.
 *
 * Gives the reader the two things they need to judge it themselves — how old,
 * and how old it is SUPPOSED to get — rather than a bare warning colour they
 * have to interpret.
 */
export function indicatorStaleNote(age: IndicatorAge | null): string | null {
  if (!age || !age.stale) return null;
  return `${age.days} days old — ${age.cadence}`;
}
