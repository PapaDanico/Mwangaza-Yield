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
    expect(REFRESH).toMatch(/if \(!failed\.length && !healthFailed && !brokeIntegrity && !jobFailed\) return;/);
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
