/**
 * The service worker's cache version must move when what it precaches moves.
 *
 * WHY THIS EXISTS WHEN sw-shell-version.test.ts ALREADY DOES
 * ----------------------------------------------------------
 * That test guards the same rule and cannot see most of what is at risk. It
 * digests APP_SHELL entries that exist in `public/`, which it selects with:
 *
 *     .filter((p) => /\.[a-z0-9]+$/i.test(p))
 *
 * Entries with a file extension. That is five static assets — the manifest,
 * two SVGs, two icons. The other twelve APP_SHELL entries are ROUTES, they end
 * in '/', they are generated into `out/` by `next build`, and they do not
 * exist when a unit test runs. So the guard covers the logo and is blind to
 * every page.
 *
 * The cost of that blind spot, measured on 21 August 2026: VERSION had sat at
 * mwangaza-v15 since 14 August while 49 commits changed shared UI. Every one
 * of the twelve precached routes had moved. Netlify had deployed all of it
 * correctly — and every returning visitor was still being served 14 August's
 * pages out of the v15 static cache, because a service worker answers from
 * cache until its version changes and nothing anywhere reported a problem.
 *
 * It was found the way the original test's own header says these are always
 * found, and warns against relying on: a person looked at the live site and
 * said it seemed unchanged.
 *
 * WHAT THIS DOES
 * --------------
 * Runs after `next build`, when the routes actually exist. Digests every
 * APP_SHELL entry — routes from `out/`, assets from `public/` — and compares
 * that against the digest recorded here beside the version it belongs to.
 * A change to either without the other fails.
 *
 * It deliberately does NOT compute the version from the content. Deriving it
 * would make cache invalidation automatic and silent, and the two-step is the
 * point: bumping a cache version evicts every returning visitor's shell, which
 * is a real cost and should be a decision somebody makes rather than a side
 * effect of editing a component.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = process.cwd();
const SW = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8');

/* Recorded pair. Update BOTH, in the same commit, or not at all. */
const SHIPPED_VERSION = 'mwangaza-v17';
const SHIPPED_DIGEST = 'a05228d72ba0dc0f';

function version() {
  const m = SW.match(/const VERSION = '([^']+)'/);
  if (!m) throw new Error('VERSION not found in sw.js — has the declaration been renamed?');
  return m[1];
}

function appShell() {
  const m = SW.match(/const APP_SHELL = \[([^\]]*)\]/);
  if (!m) throw new Error('APP_SHELL not found in sw.js — has the declaration been renamed?');
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

/** Where a precached entry actually lives once the site is built. */
function resolve(entry) {
  if (entry.endsWith('/')) return join(ROOT, 'out', entry, 'index.html');
  const inOut = join(ROOT, 'out', entry);
  return existsSync(inOut) ? inOut : join(ROOT, 'public', entry);
}

function digest() {
  const h = createHash('sha256');
  const missing = [];
  for (const entry of appShell()) {
    const path = resolve(entry);
    if (!existsSync(path)) {
      missing.push(`${entry} -> ${path.replace(ROOT + '/', '')}`);
      continue;
    }
    h.update(entry);
    h.update(readFileSync(path));
  }
  return { hex: h.digest('hex').slice(0, 16), missing };
}

const fail = (msg) => {
  console.error(`\n  FAIL  ${msg}\n`);
  process.exitCode = 1;
};

console.log('service worker shell check\n');

if (!existsSync(join(ROOT, 'out'))) {
  fail('out/ does not exist — run `npm run build` first. This check reads the\n        built routes, which is the whole reason it is not a unit test.');
  process.exit(1);
}

const entries = appShell();
const routes = entries.filter((e) => e.endsWith('/'));
const { hex, missing } = digest();

/* A digest over nothing is perfectly stable and passes every future change —
   the failure mode that makes a guard worse than no guard. */
if (routes.length < 2) fail(`only ${routes.length} route(s) parsed out of APP_SHELL — the parse is wrong`);
if (missing.length) fail(`precached entries missing from the build:\n        ${missing.join('\n        ')}`);

console.log(`  ok    ${entries.length} precached entries (${routes.length} routes, ${entries.length - routes.length} assets)`);

if (version() !== SHIPPED_VERSION) {
  fail(
    `sw.js VERSION is ${version()} but this script records ${SHIPPED_VERSION}.\n` +
      '        Set SHIPPED_VERSION and SHIPPED_DIGEST together.'
  );
} else if (SHIPPED_DIGEST === '__PENDING__') {
  console.log(`  ..    digest not yet recorded. Set SHIPPED_DIGEST = '${hex}'`);
} else if (hex !== SHIPPED_DIGEST) {
  fail(
    `precached content changed but VERSION did not.\n` +
      `        recorded ${SHIPPED_DIGEST} for ${SHIPPED_VERSION}, built ${hex}\n\n` +
      '        Every returning visitor answers from the cache opened under the\n' +
      '        OLD version until VERSION moves. They will not see this change,\n' +
      '        ever, and nothing else will report it. Bump VERSION in\n' +
      '        public/sw.js, then record the new digest here.'
  );
} else {
  console.log(`  ok    precached content matches ${SHIPPED_VERSION} (${hex})`);
}

if (process.exitCode) {
  console.error('service worker shell check FAILED\n');
} else {
  console.log('\nservice worker shell check passed.\n');
}
