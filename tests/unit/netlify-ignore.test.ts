import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The build-skip decision, tested by running the actual script.
 *
 * Netlify's `ignore` command inverts the usual polarity: exit 0 CANCELS the
 * build, non-zero runs it. Getting that backwards does not fail loudly — it
 * silently stops publishing, and the site simply stops updating while every
 * merge still reports success. So the polarity is asserted directly, in both
 * directions, and the fail-safe cases are asserted to build.
 *
 * Written after 302 production deploys in one billing period exhausted the
 * team's credits and left two merged commits undeployed.
 */
const SCRIPT = new URL('../../scripts/netlify-should-build.sh', import.meta.url).pathname;

/** Returns the exit code: 0 = skip the build, 1 = build. */
function decide(env: Record<string, string>): number {
  try {
    execFileSync('bash', [SCRIPT], {
      env: { ...process.env, ...env },
      cwd: new URL('../../', import.meta.url).pathname,
      stdio: 'pipe',
    });
    return 0;
  } catch (e) {
    return (e as { status: number }).status;
  }
}

const SKIP = 0;
const BUILD = 1;

describe('netlify build-skip decision', () => {
  it('builds when there is no baseline to diff against', () => {
    // A first build, or one after a cleared cache. Nothing is known, so the
    // only safe answer is to build.
    expect(decide({ CACHED_COMMIT_REF: '', COMMIT_REF: 'abc123' })).toBe(BUILD);
    expect(decide({ CACHED_COMMIT_REF: 'abc123', COMMIT_REF: '' })).toBe(BUILD);
  });

  it('builds on a manual redeploy of the same commit', () => {
    // Someone pressed the button. The diff is empty by definition, and
    // skipping here would make the button appear broken.
    expect(decide({ CACHED_COMMIT_REF: 'abc123', COMMIT_REF: 'abc123' })).toBe(BUILD);
  });

  it('builds when the commits cannot be diffed', () => {
    // Netlify clones shallow; the cached commit may not be present. An
    // untrustworthy diff must never cancel a build.
    expect(
      decide({
        CACHED_COMMIT_REF: '0000000000000000000000000000000000000000',
        COMMIT_REF: 'HEAD',
      })
    ).toBe(BUILD);
  });

  /* There was a sixth test here that diffed HEAD~3..HEAD in this very repo.
   * It asserted the result was one of {SKIP, BUILD} — every possible value —
   * so it could not fail on behaviour, and then it failed in CI anyway,
   * because actions/checkout clones to depth 1 and HEAD~3 does not exist.
   * A test that cannot detect a defect but can break the build is worth less
   * than nothing. The scratch-repo case below covers the same ground with
   * real commits it constructs itself, and can fail for the right reasons. */

  it('does not treat public/data as skippable, which is the whole product', () => {
    // The daily refresh commits nothing but public/data/*.json. If that were
    // ever added to the skip list the site would freeze at whatever rates it
    // last built with, while every refresh still reported success.
    const src = readFileSync(SCRIPT, 'utf8');
    const list = src.match(/grep -Ev '\^\(([^)]*)\)/)?.[1] ?? '';
    expect(list, 'skip list must not mention public/').not.toMatch(/public/);
    expect(list, 'skip list must not mention src/').not.toMatch(/src\//);
    expect(list, 'skip list must not mention netlify/').not.toMatch(/netlify\//);
  });

  it('skips a docs-only change, which is the point of the file', () => {
    // Built as a real two-commit diff in a scratch repo, so this exercises
    // the git plumbing and the grep together rather than the grep alone.
    const dir = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    execFileSync('mkdir', ['-p', `${dir}/docs`, `${dir}/src`]);
    execFileSync('bash', ['-c', `echo a > ${dir}/src/x.ts; echo a > ${dir}/docs/y.md`]);
    git('add', '-A');
    git('commit', '-qm', 'base');
    const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

    execFileSync('bash', ['-c', `echo changed >> ${dir}/docs/y.md`]);
    git('add', '-A');
    git('commit', '-qm', 'docs only');
    const docsOnly = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

    const run = (from: string, to: string) => {
      try {
        execFileSync('bash', [SCRIPT], {
          env: { ...process.env, CACHED_COMMIT_REF: from, COMMIT_REF: to },
          cwd: dir,
          stdio: 'pipe',
        });
        return SKIP;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };

    expect(run(base, docsOnly), 'a docs-only diff should skip the build').toBe(SKIP);

    // And the same machinery must build when source moves.
    execFileSync('bash', ['-c', `echo changed >> ${dir}/src/x.ts`]);
    git('add', '-A');
    git('commit', '-qm', 'src');
    const srcChange = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(run(docsOnly, srcChange), 'a src diff must build').toBe(BUILD);

    // The mixed case is the one a naive implementation gets wrong: docs AND
    // source in one diff must build, not skip.
    execFileSync('bash', ['-c', `echo m >> ${dir}/docs/y.md; echo m >> ${dir}/src/x.ts`]);
    git('add', '-A');
    git('commit', '-qm', 'mixed');
    const mixed = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(run(srcChange, mixed), 'docs + src together must build').toBe(BUILD);

    // LICENSE and SECURITY.md, added 2026-08-07. The merge that introduced
    // them triggered a full production deploy that could not change one byte
    // of the published site — this script's own cost, paid on the commit that
    // documented it. Asserted as a real diff rather than by reading the regex,
    // because an anchoring mistake (LICENSE matching web/LICENSE, say) would
    // pass a pattern check and skip a build that mattered.
    execFileSync('bash', ['-c', `echo x > ${dir}/LICENSE; echo y > ${dir}/SECURITY.md`]);
    git('add', '-A');
    git('commit', '-qm', 'licence and disclosure policy');
    const legal = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(run(mixed, legal), 'LICENSE + SECURITY.md alone should skip').toBe(SKIP);

    /* ...and the entry must be anchored at BOTH ends.
     *
     * The first version of this assertion used src/licensing/LICENSE and was
     * vacuous: the pattern is `^(...)`, so `^LICENSE` cannot match a path
     * beginning `src/`, and removing the trailing `$` did not fail the test.
     * It was caught by insisting a mutation actually apply before believing
     * its result — the harness had silently no-opped twice before that.
     *
     * A root-level sibling is the case that discriminates. `LICENSE-THIRD-
     * PARTY` starts with LICENSE, so an unanchored entry swallows it, and a
     * file that could legitimately ship with the site would stop deploying.
     */
    execFileSync('bash', ['-c', `echo z > ${dir}/LICENSE-THIRD-PARTY`]);
    git('add', '-A');
    git('commit', '-qm', 'a differently-named root licence file');
    const sibling = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    expect(run(legal, sibling), 'LICENSE-THIRD-PARTY must still build').toBe(BUILD);

    execFileSync('rm', ['-rf', dir]);
  });
});
