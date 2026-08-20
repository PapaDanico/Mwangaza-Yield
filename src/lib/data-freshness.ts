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
 * The refresh is scheduled `0 3,15 * * 1-6` — twice a day, Monday to Saturday.
 * Sunday is deliberately excluded because nothing this project reads publishes
 * then. So on a Sunday evening the newest data is legitimately over a day old,
 * and by Monday 02:59 UTC it is around 36 hours. A plain "1 day old" threshold
 * would cry wolf every single weekend, which is how a warning becomes
 * something readers learn to scroll past — the exact wolf-crying the
 * context.json budget was widened to avoid.
 *
 * THIS MUST TRACK ci.yml. The schedule below is a copy of the cron expression,
 * and a copy is a thing that goes out of date. It was nearly wrong the moment
 * it was written: the cron changed from `0 3 * * 1-5` to twice-daily in the
 * same commit that introduced this file, and leaving the old shape here would
 * have had the banner under-count missed runs — a check made wrong by the fix
 * standing next to it. `schedule-matches-workflow.test.ts` parses ci.yml and
 * fails if the two ever diverge again.
 *
 * Counting SCHEDULED RUNS THAT SHOULD HAVE HAPPENED AND DID NOT is both
 * quieter and more informative. Zero missed is silence. It also states a fact a
 * reader can act on: the pipeline has stopped, rather than the number being old.
 */

import meta from '../../public/data/meta.json';
import freshnessReport from '../../public/data/freshness.json';

/** UTC hours of the scheduled refresh; `17 3,15 * * 1-6` in ci.yml. */
export const REFRESH_HOURS_UTC = [3, 15];

/**
 * The minute within each hour. Deliberately not 0 — see the comment on the
 * cron in ci.yml. Pinned here so the copy cannot drift from the schedule.
 */
export const REFRESH_MINUTE_UTC = 17;

/** Days the refresh runs, as getUTCDay() values: Monday(1) to Saturday(6). */
export const REFRESH_DAYS_UTC = [1, 2, 3, 4, 5, 6];

/**
 * One missed run is tolerated in silence.
 *
 * A single failed scrape is normal and already handled: `carry_forward` keeps
 * the last good data, and the pipeline's own alert covers it when the pipeline
 * is running. This surface exists for the case where nothing is running at all,
 * so it should not duplicate a warning the other system gives better.
 */
export const QUIET_MISSES = 1;

/**
 * How long after its slot a run may start before it counts as MISSED.
 *
 * This is not padding. GitHub does not run a scheduled workflow at the minute
 * you asked for: scheduled runs sit on a shared queue, and the top of the hour
 * is its most contended minute. Measured on this repository's own history —
 * every scheduled run since the cron was introduced on 2026-07-25, against a
 * `0 3` slot:
 *
 *     2026-07-30  05:41Z   2h41m late
 *     2026-07-31  06:14Z   3h14m late
 *     2026-08-03  06:23Z   3h23m late
 *     2026-08-04  05:46Z   2h46m late
 *     2026-08-05  05:45Z   2h45m late
 *     2026-08-06  05:48Z   2h48m late
 *
 * `created_at` equals `run_started_at` in all six, so this is GitHub creating
 * the run late, not the job taking a long time. The delay is systematic, and
 * it is roughly three hours.
 *
 * Without a grace period `missedRuns()` counts a slot as missed the instant it
 * passes, so between 03:00 and about 06:00 every weekday this surface would
 * report a missed update that had merely not started yet. That is the exact
 * wolf-crying the whole module argues against, and it would fire daily.
 *
 * Four hours covers the worst observed delay with roughly forty minutes in
 * hand. It is deliberately generous: the cost of waiting is a late warning,
 * and the cost of not waiting is a warning nobody believes.
 */
export const RUN_GRACE_HOURS = 4;

export interface Freshness {
  generatedAt: string;
  /** Scheduled weekday refreshes that should have run since, and did not. */
  missedRuns: number;
  /** Whole days between the build's data stamp and now. */
  ageDays: number;
  /** True once the miss count clears QUIET_MISSES. */
  stale: boolean;
}

function isScheduledDay(d: Date): boolean {
  return REFRESH_DAYS_UTC.includes(d.getUTCDay());
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
  // Walk day by day and check each scheduled hour within it. Bounded so a
  // corrupt stamp cannot spin: 400 days is longer than this project has
  // existed and far past the point where the count means anything.
  const day = new Date(Date.UTC(
    since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate(), 0, 0, 0, 0,
  ));
  for (let guard = 0; guard < 400 && day <= now; guard += 1) {
    if (isScheduledDay(day)) {
      for (const hour of REFRESH_HOURS_UTC) {
        const run = new Date(day.getTime());
        run.setUTCHours(hour, REFRESH_MINUTE_UTC, 0, 0);
        // A run at or before `since` is the one that produced this data, or
        // an older one — not a miss. And a run whose slot has passed but whose
        // grace has not is LATE, which on this scheduler is the normal case
        // rather than a fault. See RUN_GRACE_HOURS.
        const dueBy = run.getTime() + RUN_GRACE_HOURS * 3_600_000;
        if (run > since && dueBy <= now.getTime()) missed += 1;
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
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


/**
 * The schedule in words, derived rather than written down.
 *
 * Three places on the site described the refresh cadence in prose: the home
 * page said "Refreshed every weekday", the feed page said "It refreshes
 * daily", and the feed's own meta description said "computed daily". All three
 * were true when written and all three were made false by one line changing in
 * ci.yml — by me, in the commit that moved the schedule to twice a day, Monday
 * to Saturday. Saturday is not a weekday and twice is not daily.
 *
 * That is the same defect this session has been removing everywhere else: a
 * claim on a page contradicted by the thing it describes. Replacing one
 * hardcoded string with another only resets the clock on it, so the sentence
 * is generated from the constants the cron test already pins to ci.yml. The
 * chain is then: cron -> constants (tested) -> prose (derived), and no link in
 * it can drift silently.
 */
export function refreshCadence(): string {
  const times = REFRESH_HOURS_UTC.length;
  const days = REFRESH_DAYS_UTC.length;
  const perDay =
    times === 1 ? 'once a day'
      : times === 2 ? 'twice a day'
        : `${times} times a day`;
  const span =
    days === 7 ? 'every day'
      : days === 6 && !REFRESH_DAYS_UTC.includes(0) ? 'Monday to Saturday'
        : days === 5 && !REFRESH_DAYS_UTC.includes(0) && !REFRESH_DAYS_UTC.includes(6)
          ? 'every weekday'
          : `on ${days} days a week`;
  return `${perDay}, ${span}`;
}


/**
 * Datasets that are past their OWN budget, from the pipeline's own verdict.
 *
 * WHY THIS IS SEPARATE FROM missedRuns().
 *
 * `freshness()` above answers "is the pipeline running?" — it counts scheduled
 * runs that should have happened and did not, from meta.generatedAt. That is a
 * true and useful question, and it is not the one a reader is asking.
 *
 * A reader wants to know whether the number in front of them is current, and
 * the pipeline can be running perfectly while one source has been failing for
 * three weeks: meta.generatedAt is refreshed by ANY scraper succeeding, so a
 * stale dataset sits behind a stamp that says today. #179 is exactly this —
 * open, legitimate, and invisible on the site.
 *
 * The per-dataset verdict is computed in backend/scrapers/healthcheck.py,
 * where the budgets live with the reasoning for each one, and published to
 * freshness.json. It is READ here, not recomputed: two copies of a cadence
 * table would drift, and the copy that drifts is never the one that gets
 * corrected. That argument is the same one rates-feed.ts makes about T-bill
 * conventions, and it was right there too.
 */
export interface DatasetFreshness {
  file: string;
  label: string;
  asOf: string;
  ageDays: number;
  budgetDays: number;
  stale: boolean;
}

/**
 * Every dataset's age against its own budget, as the pipeline measured it.
 *
 * Exposed alongside `staleDatasets` because a health panel needs the healthy
 * rows too, and reading them from here is what keeps the cadence table in one
 * place. The alternative — a component listing datasets and judging their age
 * on a threshold of its own — is what data-quality.ts did, and it reported
 * three of four datasets "old" on a morning when the pipeline had run on time.
 */
export function datasetFreshness(): DatasetFreshness[] {
  return freshnessReport.datasets as DatasetFreshness[];
}

export function staleDatasets(): DatasetFreshness[] {
  return datasetFreshness().filter((d) => d.stale);
}

/**
 * What to tell the reader about a specific source that has gone stale.
 *
 * Names the dataset, because "some data is old" is not actionable and this is
 * the whole point of publishing per-dataset ages. Returns null when everything
 * is inside its budget — silence is the healthy state, and a banner that is
 * always present is a banner nobody reads.
 */
export function staleDatasetNotice(stale: DatasetFreshness[] = staleDatasets()): string | null {
  if (stale.length === 0) return null;
  const named = stale
    .map((d) => `${d.label} (${d.ageDays} days old, expected within ${d.budgetDays})`)
    .join('; ');
  return (
    `Some figures here have not refreshed on schedule: ${named}. ` +
    `The rest of the site is current — check the Central Bank's own published ` +
    `figures before acting on the ones named.`
  );
}
