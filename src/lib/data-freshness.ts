/**
 * Whether the data on screen is as current as it is supposed to be — judged by
 * the app itself, not by the pipeline that produced it.
 *
 * WHY THIS CANNOT LIVE IN THE PIPELINE
 * -----------------------------------
 * `healthcheck.py` already measures freshness, and the workflow opens a GitHub
 * issue when a budget is breached. Both run INSIDE `refresh-data`. So the alert
 * fires when the pipeline runs and finds something stale — and stays silent
 * when the pipeline does not run at all, which is the more serious failure and
 * the one nobody is told about.
 *
 * That is the defect this codebase keeps finding in itself: a guard that cannot
 * fire in the case it exists to detect. It stopped being hypothetical on
 * 6 August 2026, when GitHub Actions could not resolve action downloads for
 * hours and no job on this repository would start. Had that persisted into the
 * 03:00 refresh, the site would have gone on serving the previous day's figures
 * with nothing anywhere saying so.
 *
 * A reader's browser is not GitHub Actions. It can compare the build's own
 * `generatedAt` against the clock and say something true without any
 * infrastructure being up.
 *
 * WHY MISSED RUNS, NOT DAYS OLD
 * -----------------------------
 * The refresh is scheduled `0 3 * * 1-5` — weekdays only. So on a Sunday
 * evening the newest data is legitimately two and a half days old, and by
 * Monday 02:59 UTC it is nearly three. A plain "3 days old" threshold would
 * cry wolf every single weekend, which is how a warning becomes something
 * readers learn to scroll past — the exact wolf-crying the context.json budget
 * was widened to avoid.
 *
 * Counting SCHEDULED RUNS THAT SHOULD HAVE HAPPENED AND DID NOT is both
 * quieter and more informative. Zero missed is silence. It also states a fact a
 * reader can act on: the pipeline has stopped, rather than the number being old.
 */

import meta from '../../public/data/meta.json';

/** UTC hour of the scheduled refresh; `0 3 * * 1-5` in ci.yml. */
export const REFRESH_HOUR_UTC = 3;

/**
 * One missed run is tolerated in silence.
 *
 * A single failed scrape is normal and already handled: `carry_forward` keeps
 * the last good data, and the pipeline's own alert covers it when the pipeline
 * is running. This surface exists for the case where nothing is running at all,
 * so it should not duplicate a warning the other system gives better.
 */
export const QUIET_MISSES = 1;

export interface Freshness {
  generatedAt: string;
  /** Scheduled weekday refreshes that should have run since, and did not. */
  missedRuns: number;
  /** Whole days between the build's data stamp and now. */
  ageDays: number;
  /** True once the miss count clears QUIET_MISSES. */
  stale: boolean;
}

function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * Scheduled refresh instants strictly after `since` and at or before `now`.
 *
 * Walks day by day from the day after `since`. The dataset spans years, not
 * decades, and a run this simple is worth more than a clever closed form
 * nobody can check.
 */
export function missedRuns(since: Date, now: Date): number {
  if (!(since instanceof Date) || Number.isNaN(since.getTime())) return 0;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return 0;

  // No explicit guard for a stamp in the future: the loop condition already
  // covers it. `cursor` starts strictly after `since`, so if `since` is later
  // than `now` the loop never runs and the answer is 0. A separate early
  // return looked defensive and was dead — no test could tell the two apart,
  // which is the definition of a line that is not doing anything.
  let missed = 0;
  const cursor = new Date(Date.UTC(
    since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate(),
    REFRESH_HOUR_UTC, 0, 0, 0,
  ));
  // A run at or before `since` is the one that produced this data, not a
  // missed one.
  if (cursor <= since) cursor.setUTCDate(cursor.getUTCDate() + 1);

  // Bounded so a corrupt future/past stamp cannot spin: 400 days is longer
  // than this project has existed and far past the point where the count
  // stops meaning anything.
  for (let guard = 0; guard < 400 && cursor <= now; guard += 1) {
    if (isWeekday(cursor)) missed += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missed;
}

export function freshness(now: Date = new Date(), generatedAt: string = meta.generatedAt): Freshness {
  const built = new Date(generatedAt);
  if (Number.isNaN(built.getTime())) {
    // An unreadable stamp is not evidence of staleness. Reporting it as stale
    // would raise an alarm about a deployment rather than about the data.
    return { generatedAt, missedRuns: 0, ageDays: 0, stale: false };
  }
  const missed = missedRuns(built, now);
  const ageDays = Math.max(0, Math.floor((now.getTime() - built.getTime()) / 86_400_000));
  return { generatedAt, missedRuns: missed, ageDays, stale: missed > QUIET_MISSES };
}

/**
 * What to tell the reader, or null when there is nothing worth saying.
 *
 * Names the consequence rather than the mechanism. "The pipeline has missed
 * three runs" means nothing to somebody deciding where to put Ksh 200,000;
 * "these rates are from 3 August and may have moved" is the same fact in the
 * only terms that matter to them.
 */
export function freshnessNotice(f: Freshness): string | null {
  if (!f.stale) return null;
  const day = f.generatedAt.slice(0, 10);
  return (
    `These figures were last updated on ${day}, and ${f.missedRuns} scheduled updates ` +
    `have been missed since. Auction rates move weekly, so treat anything here as ` +
    `indicative and check the Central Bank's own published results before acting on it.`
  );
}
