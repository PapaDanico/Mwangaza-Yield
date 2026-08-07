import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The daily refresh must be able to tell you it is broken.
 *
 * Every scraper step in refresh-data is written as
 *
 *     python X.py || echo "failed=X" >> "$GITHUB_OUTPUT"
 *
 * which exits 0 by construction, so a scraper dying cannot fail the job. That
 * is deliberate — `carry_forward()` keeps yesterday's data and partial-but-
 * fresh beats complete-but-never-shipped. The whole design then rests on one
 * thing: those recorded failures being read and reported.
 *
 * They were read in exactly one place, a step gated `if: failure()` — a
 * condition the recording itself prevents. So the alarm could not fire in the
 * case it existed for. The World Bank scraper ran that way for days, recording
 * `failed=worldbank` on every green run, and was found by a human asking.
 *
 * Two things are checked here, because the fix has two halves that rot
 * separately: the gate, and the wiring.
 */

const CI = readFileSync('.github/workflows/ci.yml', 'utf8');

/** The refresh-data job only — the CI job above it has its own steps. */
const REFRESH = CI.slice(CI.indexOf('\n  refresh-data:'));

describe('the alert can actually fire', () => {
  it('reads a real workflow', () => {
    // Every assertion below is trivially true against an empty string.
    expect(CI.length).toBeGreaterThan(2000);
    expect(REFRESH).toContain('Raise an alert');
  });

  it('is not gated on failure() alone', () => {
    const alert = REFRESH.slice(REFRESH.indexOf('- name: Raise an alert'));
    const gate = /\n\s+if:\s*(.+)/.exec(alert)?.[1] ?? '';
    expect(gate).not.toBe('failure()');
    // It must still not run on a cancelled job, which would report a shutdown
    // as a data problem.
    expect(gate).toContain('cancelled()');
  });

  it('returns without raising anything when there is nothing to say', () => {
    // Running on every completed run is only safe if the quiet case is quiet.
    // An alert that fires daily regardless of state is the wolf-crying the
    // freshness budgets were deliberately widened to avoid.
    // The health condition itself is unchanged; the self-test is an OR in
    // front of it, so a healthy run is still the only ordinary way in.
    expect(REFRESH).toMatch(
      /if \(testRecovery \|\| \(!failed\.length && !healthFailed && !brokeIntegrity && !jobFailed\)\) \{/
    );
    // And the self-test flag must be opt-in via a dispatch input, never
    // something a scheduled run can trip into.
    expect(REFRESH).toMatch(/const testRecovery = '\$\{\{ inputs\.test_recovery \}\}' === 'true';/);
    // The quiet branch must still end in a return, or a healthy run would fall
    // through and raise the very alert it just decided not to raise.
    const quiet = REFRESH.slice(REFRESH.indexOf('if (testRecovery ||'));
    expect(quiet.slice(0, quiet.indexOf('const run ='))).toContain('return;');
  });

  it('CLOSES a recovered alert instead of leaving it open forever', () => {
    // This step could raise an alert and could never clear one, so `open`
    // degraded from "still true" to "was true once" — and the script's own
    // comment leans on open meaning "still true" ("stays visible as an OPEN
    // ISSUE, which is the right register"). An alarm nobody can switch off is
    // one people stop switching on.
    const quiet = REFRESH.slice(
      REFRESH.indexOf('if (testRecovery ||'),
      REFRESH.indexOf('const run ='),
    );
    expect(quiet).toContain('issues.update');
    expect(quiet).toMatch(/state: 'closed'/);
    // Closed WITH a comment, so the issue records a fault that ended rather
    // than one somebody tidied away.
    expect(quiet).toContain('createComment');
    // And only ever issues this automation raised.
    expect(quiet).toMatch(/labels: label/);
  });

  it('gives the RECOVERY path a self-test, as the raise path already has', () => {
    /* test_alert proves the alarm can be RAISED, "so the alarm can be proven
     * to still work after anyone edits it, rather than being discovered broken
     * on the day it was needed". Standing it down had no such proof, and it is
     * the half that fails silently: a broken raise is loud because the expected
     * issue never appears, while a broken close just lets issues accumulate
     * until `open` means nothing. */
    expect(REFRESH).toContain('test_recovery');
    // It must MANUFACTURE the precondition the branch cannot arrange for
    // itself — an open alert on a healthy run — and then fall into the real
    // recovery code rather than a copy of it.
    expect(REFRESH).toMatch(/issues\.create\(/);
    expect(REFRESH).toMatch(/labels: \[label\]/);
  });

  it('fails the self-test when the recovery branch closes nothing', () => {
    /* THE GUARD INSIDE THE GUARD.
     *
     * Without this the dispatch is green whether the close worked or not —
     * a guard that cannot fire in the case it exists to detect, which would be
     * a particularly silly thing to ship inside a self-test. */
    const quiet = REFRESH.slice(
      REFRESH.indexOf('if (testRecovery ||'),
      REFRESH.indexOf('const run ='),
    );
    expect(quiet).toContain('closed += 1');
    expect(quiet).toMatch(/if \(testRecovery && closed === 0\)/);
    expect(quiet).toContain('core.setFailed');
  });

  it('runs the job for a recovery self-test, and writes no data during one', () => {
    /* The first version of this change added the input and the branch and did
     * NOT add the job condition, so refresh-data would not have run at all and
     * the self-test could never have fired. Caught here rather than by a
     * dispatch that mysteriously did nothing. */
    const jobGate = REFRESH.slice(0, REFRESH.indexOf('runs-on'));
    expect(jobGate).toContain('inputs.test_recovery');
    // And it must commit nothing, exactly like test_alert: both self-tests
    // exercise the alert step, not the pipeline.
    expect(REFRESH).toContain('!inputs.test_alert && !inputs.test_recovery');
    expect(REFRESH).not.toMatch(/if: \$\{\{ !inputs\.test_alert \}\}/);
  });

  it('declares the alert label exactly once', () => {
    // Both branches need it and JS would throw on a redeclaration in the same
    // scope — a failure that only shows up at 3am inside github-script.
    const decls = REFRESH.match(/const label = 'scraper-alert';/g) ?? [];
    expect(decls).toHaveLength(1);
  });
});

describe('every recorded failure is wired to the alert', () => {
  /**
   * The other half. Adding a scraper step is a two-line change — the step, and
   * its id in the alert's list — and forgetting the second line reproduces the
   * original defect for that one source, silently. This makes the omission
   * fail here instead.
   */
  const recorded = [...REFRESH.matchAll(/echo "failed=([a-z-]+)" >> "\$GITHUB_OUTPUT"/g)].map(
    (m) => m[1]
  );
  const wired = [...REFRESH.matchAll(/\$\{\{ steps\.([a-z-]+)\.outputs\.failed \}\}/g)].map(
    (m) => m[1]
  );

  it('finds the steps at all', () => {
    expect(recorded.length).toBeGreaterThanOrEqual(8);
    expect(wired.length).toBeGreaterThanOrEqual(8);
  });

  it('records exactly as many failures as it reads', () => {
    expect(recorded.length).toBe(wired.length);
  });

  it('every step that can record a failure has its id read by the alert', () => {
    /* The recorded token and the step id are not the same string by
     * convention — `id: auctions` writes `failed=auction-results` — so this
     * maps ids to their step, then asserts each id appears in the alert list.
     * Comparing the two token sets directly would fail on that naming and
     * teach someone to delete the test. */
    const stepIds = [...REFRESH.matchAll(/\n\s+id:\s*([a-z-]+)\n(?:.|\n)*?\$GITHUB_OUTPUT/g)];
    expect(stepIds.length).toBeGreaterThan(0);
    const missing = wired.filter((id) => !REFRESH.includes(`id: ${id}`));
    expect(missing).toEqual([]);
  });

  it('names a step id that records nothing — so the list cannot go stale', () => {
    // The inverse direction: an id read by the alert whose step no longer
    // records a failure is dead wiring, and reads as coverage that is not
    // there.
    for (const id of wired) {
      const step = REFRESH.slice(REFRESH.indexOf(`id: ${id}\n`));
      const nextStep = step.indexOf('\n      - name:');
      const body = nextStep === -1 ? step : step.slice(0, nextStep);
      expect(body, `step '${id}' is read by the alert but records no failure`).toContain(
        '$GITHUB_OUTPUT'
      );
    }
  });
});

describe('an unchanged fault is not emailed every morning', () => {
  /**
   * The alert now fires on the first failing day rather than waiting for a
   * freshness budget to breach — and these reach a human by email. Commenting
   * on every failing run would post an identical message daily until the fault
   * is fixed, which is how an alert becomes something you filter.
   *
   * An unchanged fault stays visible as an OPEN ISSUE. That is the right
   * register for "still true", as against "just happened".
   */
  const alert = REFRESH.slice(REFRESH.indexOf('- name: Raise an alert'));

  it('compares against the previous alert before commenting', () => {
    expect(alert).toMatch(/listComments/);
    expect(alert).toMatch(/if \(substance\(last \|\| ''\) === substance\(body\)\) \{/);
  });

  it('returns without commenting when nothing changed', () => {
    const guard = alert.slice(alert.indexOf('=== substance(body)'));
    expect(guard.slice(0, 200)).toMatch(/return;/);
  });

  it('strips the run URL before comparing, since it differs every run', () => {
    // Without this the bodies never match and the suppression never fires —
    // a guard that cannot fire, which is the defect this file exists for.
    expect(alert).toMatch(/replace\(\/\^\\\[View the run\\\].*\$\/m, ''\)/);
  });

  it('still creates a fresh issue when none is open', () => {
    expect(alert).toMatch(/issues\.create\(/);
  });
});

/**
 * A recorded failure must be able to actually happen.
 *
 * Every scraper step ends in `|| echo "failed=..." >> $GITHUB_OUTPUT`, so a
 * failing scraper is reported by the alert step without aborting the run.
 * `timeout-minutes` defeats that entirely: GitHub kills the shell and marks
 * the step FAILED, so the `||` never runs, nothing is recorded, and every
 * later step is skipped because their `if:` carries no status function.
 *
 * On 2026-08-07 the World Bank step hit its six-minute bound at 6m12s. The
 * macro scraper had already run so USD/KES refreshed — but the securities
 * register, auction results, CBR history, CPI history, the bond universe and
 * the auction calendar were all skipped, and so was `Check data freshness`,
 * the gate that would have caught it. Seven steps carried the same pairing.
 *
 * The bound now lives in the shell (`timeout -k 20s Ns …`), which returns 124
 * and lets the `||` fire. This fails if the two are ever paired again.
 */
describe('scraper steps can record their own failure', () => {
  const REFRESH_JOB = CI.slice(CI.indexOf('\n  refresh-data:'));

  it('reads a real job body', () => {
    expect(REFRESH_JOB).toContain('Run macro scraper');
    expect(REFRESH_JOB.length).toBeGreaterThan(2000);
  });

  it('pairs no `timeout-minutes` with a `|| echo failed=` guard', () => {
    // Split into steps and check each one in isolation, so a bound on one
    // step cannot be excused by a guard on another.
    const steps = REFRESH_JOB.split('\n      - name: ').slice(1);
    const broken = steps
      .filter((s) => /timeout-minutes:/.test(s.split('\n      - name:')[0]))
      .filter((s) => /\|\| echo "failed=/.test(s.split('\n      - name:')[0]))
      .map((s) => s.split('\n')[0]);
    expect(
      broken,
      `these steps bound with timeout-minutes AND rely on a || guard the bound `
        + `bypasses — move the bound into the shell:\n${broken.join('\n')}`,
    ).toEqual([]);
  });

  it('bounds every recorded scraper in the shell instead', () => {
    // The guard above is satisfied by removing the bound entirely, which would
    // reintroduce the unbounded-step problem. So each guarded scraper must
    // carry a shell timeout.
    const steps = REFRESH_JOB.split('\n      - name: ').slice(1);
    const guarded = steps.filter((s) => /\|\| echo "failed=[a-z-]+" >> "\$GITHUB_OUTPUT"/.test(s));
    expect(guarded.length).toBeGreaterThan(5);
    const unbounded = guarded
      .filter((s) => /run: python /.test(s))
      .map((s) => s.split('\n')[0]);
    expect(
      unbounded,
      `guarded scrapers with no shell bound: ${unbounded.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * The browser suite must be bounded, and must still be able to fail.
 *
 * WHY IT IS A SEPARATE CONCERN FROM THE SCRAPERS ABOVE
 *
 * Every scraper carries `|| echo "failed=..."` so a failure is RECORDED while
 * the rest of the pipeline continues, and #176 moved their bounds into the
 * shell because `timeout-minutes` kills that guard.
 *
 * This step is the opposite case and needs the opposite treatment. A browser
 * suite that fails means the site is broken for readers, so the build must go
 * red — there is nothing to record and continue past. What it shares with the
 * scrapers is the need for a bound: it had none at all, so a deadlocked
 * browser would have run to GitHub's six-hour job limit. #176 fixed the
 * scrapers and missed this step entirely.
 *
 * Two failure directions, both silent, so both are asserted:
 *
 *   no bound          — a hang costs six hours instead of ten minutes
 *   a `||` appended   — the check can no longer fail the build, which is the
 *                       same as deleting it, and is exactly what somebody
 *                       reaches for when a suite is "flaky"
 */
describe('the browser smoke step', () => {
  const STEP = (() => {
    const i = CI.indexOf('- name: Browser smoke tests');
    return i < 0 ? '' : CI.slice(i, CI.indexOf('\n      - ', i + 10));
  })();

  it('is present at all, so the assertions below are not vacuous', () => {
    expect(STEP).toContain('test:e2e');
  });

  it('is bounded in the shell', () => {
    const m = /timeout -k \d+s (\d+)s npm run test:e2e/.exec(STEP);
    expect(
      m,
      'the browser suite has no shell bound — a deadlocked browser runs to '
        + "GitHub's six-hour job limit, which is how this was found",
    ).not.toBeNull();
    // Measured at 124s on a real runner. Comfortably above, so a slow or
    // contended runner still passes; far below six hours.
    const seconds = Number(m![1]);
    expect(seconds).toBeGreaterThanOrEqual(300);
    expect(seconds).toBeLessThanOrEqual(1800);
  });

  it('does NOT swallow its own failure with a `||` guard', () => {
    // The scraper pattern applied here would turn the check off: the step
    // would pass whatever the browser found.
    expect(
      /\|\|/.test(STEP),
      'a `||` on the browser step means a failing suite no longer fails the '
        + 'build — that is the check being disabled, not made more reliable',
    ).toBe(false);
  });

  it('does not use timeout-minutes, which kills without a message', () => {
    expect(/timeout-minutes:/.test(STEP)).toBe(false);
  });
});
