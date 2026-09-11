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
const SHIPPED_VERSION = 'mwangaza-v29';
const SHIPPED_DIGEST = '40fbc55ffa534700';

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

/**
 * Blank out the one thing in a built page that moves without anybody editing
 * it: the age in the staleness notice.
 *
 * `StaleDataNotice` is server-rendered when the build already knows the data
 * is stale — that is the CLS fix, and it puts a clock-derived sentence into
 * EVERY precached route ("USD/KES (13 days old, …)"). While the pipeline is
 * down that number ticks upward on its own, so a digest taken over the raw
 * bytes stops matching a day or two after it is recorded, on a tree nobody
 * has touched.
 *
 * That is not the change this guard exists to catch. It exists to catch a
 * precached page changing while VERSION stays put, and a reader being served
 * the old one indefinitely. An age that advances with the calendar is not
 * somebody shipping a new page behind a stale cache version — and a guard that
 * goes red on its own teaches people to re-record its constant without reading
 * it, which is the same as not having it.
 *
 * THE SECOND ONE, WHICH WOULD HAVE FAILED EVERY SINGLE DAY
 *
 * The navbar's freshness button carries a title computed the same way:
 * "These figures were last updated on 2026-08-19, and 32 scheduled updates
 * have been missed since". The schedule ran twice daily, so that count ticks
 * by TWO every day the pipeline stays down, and the navbar is on all twelve
 * precached routes.
 *
 * It was found the expensive way. The digest moved overnight with nothing
 * edited; rebuilding the same commit gave a different answer than had been
 * recorded at it, while two consecutive builds were byte-identical. Grepping
 * twelve routes for date-shaped text found nothing, because the string is in a
 * `title` attribute. What settled it was building twice with `global.Date`
 * shifted a day forward under `--require` and diffing the per-entry digests —
 * every route moved — then diffing the HTML token by token.
 *
 * Only the digits are replaced, and only inside these two fixed phrases. If a
 * sentence itself changes — different wording, a new indicator named, the
 * notice appearing on a route that did not carry it — the bytes around the
 * number move and the digest still catches it.
 */
function normalise(buf, path) {
  if (!path.endsWith('.html')) return buf;
  return Buffer.from(
    buf
      .toString('utf8')
      .replace(/\b\d+ days old\b/g, 'N days old')
      .replace(/\band \d+ scheduled updates\b/g, 'and N scheduled updates'),
    'utf8'
  );
}

/* Routes whose bytes are a function of the calendar, and cannot be digested.
 *
 * /macro/ renders a T-bill maturity ladder anchored to TODAY — "7 Nov 2026 /
 * 60 days", with the highlight on whichever rung is nearest — so every one of
 * its dates, day counts and highlight classes moves each night. That is the
 * widget working correctly, not a change anybody made.
 *
 * A digest cannot guard a page like that. Including it fails this check every
 * single day with nothing edited, and a guard that reddens on its own teaches
 * people to re-record its constant without reading it, which is the same as
 * not having the guard — the wolf-crying this repository refuses elsewhere.
 * Bumping VERSION daily to satisfy it would be worse still: it evicts every
 * returning visitor's shell every day.
 *
 * The cost is real and worth naming: a genuine change to /macro/ will not be
 * caught here. It is still PRECACHED and still asserted to exist below; what
 * it cannot do is participate in change detection. The alternative — rendering
 * that ladder on the client so the HTML stops carrying today's date — would
 * let it back in, and is the better fix whenever somebody touches that
 * component. */
const CALENDAR_ROUTES = new Set(['/macro/']);

function digest() {
  const h = createHash('sha256');
  const missing = [];
  /* Per entry as well as overall.
   *
   * A mismatch used to say only that the total had moved, which is the least
   * useful half of the answer: on 8 September the digest changed with no source
   * change at all — two consecutive builds were byte-identical, so the build is
   * deterministic and something in ONE precached route had followed the
   * calendar over midnight. Finding which meant grepping twelve routes for
   * anything date-shaped and still not being sure.
   *
   * `--entries` prints the per-entry digests, and a failure now says to run it.
   * The next time this moves on its own, one command names the file. */
  const perEntry = [];
  for (const entry of appShell()) {
    const path = resolve(entry);
    if (!existsSync(path)) {
      missing.push(`${entry} -> ${path.replace(ROOT + '/', '')}`);
      continue;
    }
    if (CALENDAR_ROUTES.has(entry)) {
      perEntry.push([entry, 'calendar-bound']);
      continue;
    }
    const bytes = normalise(readFileSync(path), path);
    perEntry.push([entry, createHash('sha256').update(bytes).digest('hex').slice(0, 12)]);
    h.update(entry);
    h.update(bytes);
  }
  return { hex: h.digest('hex').slice(0, 16), missing, perEntry };
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
const { hex, missing, perEntry } = digest();

/* A digest over nothing is perfectly stable and passes every future change —
   the failure mode that makes a guard worse than no guard. */
if (routes.length < 2) fail(`only ${routes.length} route(s) parsed out of APP_SHELL — the parse is wrong`);
if (missing.length) fail(`precached entries missing from the build:\n        ${missing.join('\n        ')}`);

console.log(`  ok    ${entries.length} precached entries (${routes.length} routes, ${entries.length - routes.length} assets)`);

if (process.argv.includes('--entries')) {
  for (const [entry, d] of perEntry) console.log(`        ${d}  ${entry}`);
}

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
      `        recorded ${SHIPPED_DIGEST} for ${SHIPPED_VERSION}, built ${hex}\n` +
      '        run with --entries to see which precached file moved\n\n' +
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
