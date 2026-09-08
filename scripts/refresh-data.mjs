#!/usr/bin/env node
/**
 * The refresh in RUNBOOK-REFRESH-WITHOUT-CI.md, with its one trap enforced.
 *
 * This is NOT a second refresh path. It writes the same files, in the same
 * order, through the same scrapers as the `refresh-data` job — the runbook's
 * "do not add a second refresh path" rule is about a writer on a DIFFERENT
 * cadence, and this has no cadence at all. It runs when a person runs it.
 *
 * WHAT IT ADDS, AND WHY PROSE WAS NOT ENOUGH
 *
 * The runbook's most important paragraph is a warning that the scrapers WRITE
 * EVEN WHEN THEY FAIL: a run that reaches nothing still carries the previous
 * values forward and still stamps meta.json with the time it ran. Committing
 * that tells the site the pipeline ran today, which suppresses the staleness
 * notice on data exactly as old as it was — the banner going quiet at the
 * moment it is most needed.
 *
 * That already happened once, in a container with no egress: generatedAt moved
 * from 2026-08-15 to 2026-08-16 having fetched nothing. The runbook's remedy is
 * three git commands a person has to remember to run, after a long command that
 * appeared to succeed. This runs them.
 *
 * THE RULE, AND THE WEAKER ONE THAT FAILED
 *
 * First attempt: keep the run if any data file changed. It was tested in this
 * container, with every source 403ing, and it KEPT the run and stamped
 * meta.json to today — reproducing the exact incident the runbook documents.
 *
 * Two things lie. The EXIT CODE lies: macro_parser.py returns 0 having fetched
 * nothing, because carry_forward() is a valid outcome. FILE-CHANGED lies too:
 * macro.json is rewritten on a failed run to record the failure, so bytes move
 * while no figure does.
 *
 * What cannot lie is whether an OBSERVATION got newer. Every row carries the
 * date of the thing measured — `date`, `auctionDate`, `asOf` — beside telemetry
 * recording when we last looked: `lastChecked`, `fetchedAt`, `checkedAt`,
 * `generatedAt`. A failed run advances the telemetry and leaves the observation
 * exactly where it was. That is the whole distinction, and it is the one the
 * staleness notice is computed from.
 *
 * So: take the newest observation date in each file before and after. If not
 * one of them advanced, nothing arrived, and the run is discarded including the
 * stamps. A partial refresh is a valid outcome and is kept; an empty one is not
 * an outcome at all.
 *
 * Requires network access to CBK, KNBS, the National Treasury and the World
 * Bank. From a container behind an egress proxy every source 403s on CONNECT,
 * this will find no evidence, and it will restore the tree and exit non-zero —
 * which is the correct behaviour, not a failure of the script.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DATA = 'public/data';

/* Rewritten by every run regardless of what arrived. Never evidence. */
const STAMPS = new Set(['meta.json', 'freshness.json']);

/* The runbook's order. Each is independent and allowed to fail on its own:
 * carry_forward() keeps the previous value, so a partial refresh is valid. */
const SCRAPERS = [
  'macro_parser.py',
  'worldbank.py',
  'registry.py',
  'auction_results.py',
  'cbr_history_parser.py',
  'cpi_history_parser.py',
  'expand_universe.py',
  // --write, or it reports and changes nothing. The flag is the difference
  // between the probe this started as and the writer ci.yml actually runs.
  ['qebr_parser.py', '--write'],
  'refresh_calendar.py',
];

/** `--push` commits and pushes, but only a run that passed the verdict below. */
const PUSH = process.argv.includes('--push');

/* THE AUTHORITATIVE SIGNAL.
 *
 * freshness.json carries an `asOf` per dataset: the date of the newest
 * OBSERVATION in that file, computed by healthcheck.py. It is the number the
 * reader-facing staleness notice is derived from, so it is the right thing to
 * ask "did anything actually get newer" — and asking the project's own answer
 * beats re-deriving one here.
 *
 * A blacklist of telemetry keys was tried first and lost twice, because every
 * scraper records its failures somewhere new: macro.json rows gain
 * `lastAttempt` and `attemptFailed`, and data-manifest.json advances
 * `lastSuccessfulScrape` even when every single source 403'd. There is no
 * winning a guessing game against fields that get added; asOf is defined.
 */
function asOfByDataset() {
  const f = JSON.parse(readFileSync(`${ROOT}/${DATA}/freshness.json`, 'utf8'));
  return Object.fromEntries(
    (f.datasets ?? []).filter((d) => d.file !== 'meta.json').map((d) => [d.file, d.asOf])
  );
}

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });

function dirty() {
  return sh(`git status --porcelain -- ${DATA}`)
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
    .map((p) => p.replace(`${DATA}/`, ''));
}

function restore() {
  sh(`git checkout -- ${DATA}`);
}

/* A dirty tree before we start makes "what did this run change?" unanswerable,
 * and the whole guard below rests on being able to answer it. */
const preexisting = dirty();
if (preexisting.length) {
  console.error(
    `refusing to run: ${DATA} already has uncommitted changes\n` +
      preexisting.map((f) => `  ${f}`).join('\n') +
      '\n\nCommit or discard them first — this script decides whether to keep a\n' +
      'run by looking at what changed, and cannot tell your edits from its own.'
  );
  process.exit(2);
}

const before = asOfByDataset();

console.log('refreshing — network to CBK, KNBS, Treasury and the World Bank required\n');

const failed = [];
for (const s of SCRAPERS) {
  const label = Array.isArray(s) ? s.join(' ') : s;
  process.stdout.write(`  ${label.padEnd(30)}`);
  try {
    const [script, ...flags] = Array.isArray(s) ? s : [s];
    execFileSync('python3', [script, ...flags], {
      cwd: `${ROOT}/backend/scrapers`,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15 * 60_000,
    });
    console.log('ok');
  } catch (e) {
    /* One line on an unreachable source and exit 1 is the documented shape of
     * a network failure. A traceback means something else went wrong and is
     * worth reading, so it is surfaced rather than folded into a count. */
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    console.log(/Traceback/.test(out) ? 'FAILED (traceback — read it)' : 'unreachable');
    if (/Traceback/.test(out)) console.log(out.trim().split('\n').slice(-6).map((l) => `      ${l}`).join('\n'));
    failed.push(label);
  }
}

/* healthcheck must run BEFORE the verdict, because it is what recomputes asOf.
 * Its output is also the operator's read on the run, so it is shown either way. */
console.log('\nrecomputing freshness');
execFileSync('python3', ['healthcheck.py', '--publish'], {
  cwd: `${ROOT}/backend/scrapers`,
  stdio: 'inherit',
});

const after = asOfByDataset();
const advanced = Object.keys(after).filter((f) => after[f] && (!before[f] || after[f] > before[f]));

console.log(`\n${SCRAPERS.length - failed.length}/${SCRAPERS.length} scrapers exited without error`);
if (advanced.length) {
  for (const f of advanced) console.log(`  ${f}: asOf ${before[f] ?? 'none'} -> ${after[f]}`);
} else {
  console.log('  no dataset asOf advanced');
}

if (advanced.length === 0) {
  restore();
  console.error(
    '\nNOTHING WAS FETCHED — the run has been discarded.\n\n' +
      'Files changed and scrapers exited 0, and neither means data arrived: a\n' +
      'scraper that reaches nothing still carries the previous values forward,\n' +
      'still records the attempt, and still stamps meta.json. Not one dataset\n' +
      'asOf moved, so there is nothing new here.\n\n' +
      'Keeping it would tell the site the pipeline ran today, on data exactly as\n' +
      'old as it was, and silence the staleness notice at the moment it is most\n' +
      `needed.\n\n${DATA} has been restored. Nothing to commit.`
  );
  /* EXIT 3, NOT 1, AND THE DIFFERENCE MATTERS TO A SCHEDULER.
   *
   * "Nothing arrived" is the ordinary outcome of a run on a day CBK published
   * nothing, or on a laptop that was asleep, or behind an egress proxy. It is
   * the guard working, not a fault. Exit 1 is kept for a run that genuinely
   * went wrong — an archive contradiction, a push that would not land.
   *
   * Under cron those two must not look alike: a wrapper that alerts on every
   * non-zero exit would page somebody most mornings, and an operator who
   * learns to ignore the alert has no alert. scripts/refresh-cron.sh reads
   * this code and stays quiet on 3. */
  process.exit(3);
}

/* Only now are the derived artefacts worth rebuilding: rates.json is computed
 * from the data above, and freshness.json must be republished or the per-dataset
 * ages stay frozen while the figures around them move — under-reporting
 * staleness, which the runbook calls worse than not refreshing at all. */
console.log('\nrebuilding the rates feed');
sh('node scripts/build-rates-feed.mjs', { stdio: 'inherit' });

/* The prediction ledger, which ci.yml rebuilds in the same job. It reads the
 * archive the scrapers just wrote, so it belongs after them and before the
 * commit — a refresh that moved an auction result and left the ledger behind
 * publishes a scorecard measured against data it no longer matches. */
console.log('\nupdating the prediction ledger');
try {
  sh('npm run build:engine', { stdio: 'inherit' });
  sh('node scripts/update-predictions.mjs', { stdio: 'inherit' });
} catch {
  console.error('  prediction ledger failed — the data above still stands');
}

/* Integrity, not freshness: does the archive contradict itself after what just
 * landed. ci.yml fails the job on this and so does this script, because a
 * contradiction is the one thing that must not be pushed. */
console.log('\nchecking the auction archive for contradictions');
try {
  execFileSync('python3', ['check_archive.py'], { cwd: `${ROOT}/backend/scrapers`, stdio: 'inherit' });
} catch {
  restore();
  console.error('\nARCHIVE CONTRADICTS ITSELF — the run has been discarded and the tree restored.');
  process.exit(1);
}

console.log(`\n${sh(`git diff --stat -- ${DATA}`).trim()}`);
if (failed.length) console.log(`\npartial refresh — did not reach: ${failed.join(', ')}`);

if (!PUSH) {
  console.log('\nNext: npm run ci, then commit public/data and push.');
  console.log('Or re-run with --push to commit and push this refresh.');
  process.exit(0);
}

/* Committing is gated on the same verdict as everything above: this line is
 * only reached when a dataset's asOf advanced. */
console.log('\ncommitting');
sh('git add public/data/*.json public/data/*.csv');
try {
  sh('git add backend/scrapers/tbill-probe-report.txt');
} catch {
  /* The probe has not run on this machine; nothing to stage. */
}
const stamp = new Date().toISOString().slice(0, 10);
sh(`git commit -m "chore(data): refresh ${stamp}"`, { stdio: 'inherit' });

/* A refresh spends minutes reading PDFs, which is a wide window for somebody
 * else to push. A bare push loses the whole run to a non-fast-forward — it
 * happened once and cost 120 files — so rebase onto whatever arrived and retry,
 * exactly as ci.yml does. */
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    sh('git push', { stdio: 'inherit' });
    console.log('\npushed.');
    process.exit(0);
  } catch {
    console.error(`push rejected (attempt ${attempt}) — rebasing onto the new tip`);
    try { sh('git pull --rebase origin main', { stdio: 'inherit' }); } catch { /* reported below */ }
  }
}
console.error('\npush failed three times. The refresh is committed locally; resolve and push by hand.');
process.exit(1);
