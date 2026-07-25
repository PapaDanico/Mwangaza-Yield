// Goal progress over time.
//
// A plan tells you what to do. It cannot tell you whether you did it. Everything
// else in the app answers "what would happen if" — this is the one place that
// answers "what actually happened", by holding the plan's own projection against
// figures the saver enters as they go.
//
// A checkpoint is deliberately one number and one date. Asking for a full
// portfolio breakdown every quarter is how a progress tracker stops being used
// by month four; asking "what is it worth today" is a question someone can
// answer from a statement in ten seconds.

export interface Checkpoint {
  /** ISO date, day resolution. */
  date: string;
  /** What the pot was actually worth on that date, in KES. */
  capitalKES: number;
}

export interface ProgressPoint {
  date: string;
  actualKES: number;
  /** What the plan implied the pot would be worth by this date. */
  plannedKES: number;
  /** actual − planned. Positive is ahead. */
  varianceKES: number;
}

export type ProgressStatus = 'ahead' | 'on-track' | 'behind' | 'too-early';

export interface ProgressReport {
  targetKES: number;
  points: ProgressPoint[];
  latest: ProgressPoint | null;
  /** Share of the target funded at the latest checkpoint, 0–1+. */
  coverageRatio: number;
  status: ProgressStatus;
  /**
   * Years to the target at the pace ACTUALLY observed, rather than the pace the
   * plan assumed. Null until there are two checkpoints far enough apart to
   * measure a pace at all.
   */
  revisedYearsToTarget: number | null;
  /** Contributions implied by the observed pace, net of investment growth. */
  observedMonthlyContributionKES: number | null;
  monthsObserved: number;
}

/**
 * Value of a pot after `months`, starting at `startKES`, adding `monthlyKES` at
 * each month end, compounding at `annualRatePct` a year.
 *
 * Monthly stepping, not the annual approximation the FIRE planner used to carry
 * (`pot * (1 + r) + monthly * 12 * (1 + r/2)`). That approximation exists only
 * because it is hard to do better in one line, and it cannot answer "where
 * should I be in April" at all. One model now serves both the plan and the
 * progress check, so the projection a saver is measured against is the same one
 * they were shown when they made the plan.
 */
export function projectPot(
  startKES: number,
  monthlyKES: number,
  annualRatePct: number,
  months: number
): number {
  const monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  let pot = startKES;
  for (let m = 0; m < months; m++) pot = pot * (1 + monthlyRate) + monthlyKES;
  return pot;
}

/** Whole months from `from` to `to`, never negative. */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, to.getUTCDate() < from.getUTCDate() ? months - 1 : months);
}

/**
 * Months until `projectPot` reaches `targetKES`, or null if it never does within
 * `maxYears`. A pot that neither grows nor receives contributions never gets
 * there, and saying so is more use than a number.
 */
export function monthsToTarget(
  startKES: number,
  monthlyKES: number,
  annualRatePct: number,
  targetKES: number,
  maxYears = 60
): number | null {
  if (startKES >= targetKES) return 0;
  if (monthlyKES <= 0 && annualRatePct <= 0) return null;
  const monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  let pot = startKES;
  for (let m = 1; m <= maxYears * 12; m++) {
    pot = pot * (1 + monthlyRate) + monthlyKES;
    if (pot >= targetKES) return m;
  }
  return null;
}

/**
 * A checkpoint is called on-track while it sits within this much of the plan.
 * Bond yields move, contributions slip by a month, a statement is dated the 2nd
 * rather than the 30th. Flagging a 1% miss as "behind" trains the saver to
 * ignore the signal, which costs more than the 1%.
 */
const ON_TRACK_TOLERANCE = 0.05;

/**
 * Hold recorded checkpoints against the plan's own projection.
 *
 * `startedAt` and `startKES` anchor the projection — normally the day the plan
 * was saved and the capital it was saved with. Checkpoints before that anchor
 * are ignored rather than extrapolated backwards, since a plan cannot be
 * credited or blamed for a period it did not cover.
 */
export function buildProgress(
  checkpoints: Checkpoint[],
  opts: {
    startedAt: string;
    startKES: number;
    monthlyKES: number;
    annualRatePct: number;
    targetKES: number;
  }
): ProgressReport {
  const start = new Date(opts.startedAt);
  const ordered = [...checkpoints]
    .filter((c) => Number.isFinite(c.capitalKES) && new Date(c.date) >= start)
    .sort((a, b) => a.date.localeCompare(b.date));

  const points: ProgressPoint[] = ordered.map((c) => {
    const months = monthsBetween(start, new Date(c.date));
    const plannedKES = projectPot(opts.startKES, opts.monthlyKES, opts.annualRatePct, months);
    return { date: c.date, actualKES: c.capitalKES, plannedKES, varianceKES: c.capitalKES - plannedKES };
  });

  const latest = points.length ? points[points.length - 1] : null;
  const coverageRatio = latest && opts.targetKES > 0 ? latest.actualKES / opts.targetKES : 0;

  let status: ProgressStatus = 'too-early';
  if (latest && latest.plannedKES > 0) {
    const ratio = latest.actualKES / latest.plannedKES;
    status = ratio > 1 + ON_TRACK_TOLERANCE ? 'ahead' : ratio < 1 - ON_TRACK_TOLERANCE ? 'behind' : 'on-track';
  }

  // Pace actually observed, measured between the first and last checkpoint.
  // Below two months apart the arithmetic divides by a rounding error and
  // reports a pace of millions a month, so it refuses instead.
  let revisedYearsToTarget: number | null = null;
  let observedMonthlyContributionKES: number | null = null;
  let monthsObserved = 0;
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    monthsObserved = monthsBetween(new Date(first.date), new Date(last.date));
    if (monthsObserved >= 2) {
      // Strip out the growth the pot would have managed on its own; whatever is
      // left is money the saver actually put in.
      const grownAlone = projectPot(first.actualKES, 0, opts.annualRatePct, monthsObserved);
      const monthlyRate = Math.pow(1 + opts.annualRatePct / 100, 1 / 12) - 1;
      const annuityFactor =
        monthlyRate > 0 ? (Math.pow(1 + monthlyRate, monthsObserved) - 1) / monthlyRate : monthsObserved;
      observedMonthlyContributionKES = (last.actualKES - grownAlone) / annuityFactor;
      const months = monthsToTarget(
        last.actualKES,
        Math.max(0, observedMonthlyContributionKES),
        opts.annualRatePct,
        opts.targetKES
      );
      revisedYearsToTarget = months === null ? null : months / 12;
    }
  }

  return {
    targetKES: opts.targetKES,
    points,
    latest,
    coverageRatio,
    status,
    revisedYearsToTarget,
    observedMonthlyContributionKES,
    monthsObserved,
  };
}
