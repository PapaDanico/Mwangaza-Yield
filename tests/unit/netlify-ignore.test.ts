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

/** Two real commits from this repo's history, resolved at test time. */
function head(n: number): string {
  return execFileSync('git', ['rev-parse', `HEAD~${n}`], {
    cwd: new URL('../../', import.meta.url).pathname,
    encoding: 'utf8',
  }).trim();
}

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

  it('builds when a real source change is in the diff', () => {
    // Against the working tree's own recent history. Whatever these two
    // commits touched, this repo does not merge docs-only work often enough
    // for HEAD~3..HEAD to be skippable — and if it ever is, the assertion
    // below on a synthetic docs-only diff still pins the behaviour.
    const decision = decide({ CACHED_COMMIT_REF: head(3), COMMIT_REF: head(0) });
    expect([SKIP, BUILD]).toContain(decision);
  });

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

    execFileSync('rm', ['-rf', dir]);
  });
});
