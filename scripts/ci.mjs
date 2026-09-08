#!/usr/bin/env node
/**
 * Everything `test-and-build` runs in ci.yml, in one command, on any machine.
 *
 * WHY THIS EXISTS
 *
 * GitHub Actions has not allocated a runner to this repository since 15 August
 * 2026. It DID work — runs 24 to 28 completed green on 25 July — so this is a
 * regression in something outside the repository rather than a workflow that
 * was never right. Either way the effect is the same: the only automated
 * quality gate this project had has been silent for weeks, and every check in
 * it has been run by hand since.
 *
 * Running them by hand is fine when somebody remembers the list. This is the
 * list. It is derived from ci.yml step for step, in the same order, so the two
 * cannot drift apart without somebody noticing that one of them is shorter.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not gate the deploy. Netlify builds after a merge, so a gate there
 * refuses to PUBLISH broken code rather than refusing to merge it, and it
 * spends a build credit to find out. This runs before the push, which is where
 * a gate is worth having, and costs nothing.
 *
 * It also does not fail on stale data. `published-data-freshness.test.ts` is a
 * monitor of the pipeline, not a test of the code, and while the pipeline is
 * down it is red by design — see the note in that file. Blocking every push on
 * it would couple "the data is old" to "you may not ship a fix", which is
 * exactly backwards. It is reported at the end instead, loudly, and counted
 * separately.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/* The browser suites need a Chromium that Playwright can find. The versioned
 * chrome-headless-shell it looks for by default is absent here and the error
 * says "run npx playwright install", which is wrong — a full Chromium is
 * already present and both scripts accept an override. */
const chromium = (() => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
  const guess = dir && `${base}/${dir}/chrome-linux/chrome`;
  return guess && existsSync(guess) ? guess : null;
})();

/* ci.yml's test-and-build, in its order. */
const STEPS = [
  ['unit tests', 'npm test'],
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['build', 'npm run build'],
  ['engine smoke', 'npm run build:engine && npm run test:engine'],
  ['browser smoke', 'npm run test:e2e', { browser: true }],
  ['content security policy', 'npm run verify:csp', { browser: true }],
  ['service worker shell', 'node scripts/verify-sw-shell.mjs'],
  ['scraper parsers', 'cd backend/scrapers && python3 discover_treasury.py --selftest'],
  ['auction archive integrity', 'cd backend/scrapers && python3 check_archive.py'],
];

const failed = [];
for (const [name, cmd, opts = {}] of STEPS) {
  if (opts.browser && !chromium) {
    console.log(`  SKIP  ${name} — no Chromium found; set CHROMIUM_PATH`);
    failed.push(`${name} (skipped)`);
    continue;
  }
  process.stdout.write(`  ${name.padEnd(28)}`);
  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: 'pipe',
      env: chromium ? { ...process.env, CHROMIUM_PATH: chromium } : process.env,
    });
    console.log('ok');
  } catch (e) {
    console.log('FAILED');
    failed.push(name);
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n');
    console.log(out.slice(-14).map((l) => `      ${l}`).join('\n'));
  }
}

console.log(`\n${STEPS.length - failed.length}/${STEPS.length} checks passed`);
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('Safe to push.');
