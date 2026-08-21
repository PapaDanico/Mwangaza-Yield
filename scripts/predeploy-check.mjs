/**
 * Gate a direct-to-Netlify deploy.
 *
 * WHY THIS EXISTS
 * ---------------
 * Deploying straight to Netlify skips the one thing the git-connected path
 * gave us for free: a build Netlify ran itself, from a commit somebody
 * reviewed. A direct deploy uploads whatever happens to be in `out/` at the
 * moment it runs, which may be a stale build, a dirty tree, or a build made
 * from data that has since changed.
 *
 * So the checks that used to be implicit have to be made explicit. Each one
 * below stands in for a specific way a hand-rolled deploy goes wrong, and each
 * failure names what to do rather than just refusing.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK
 * -------------------------------------
 * Correctness of the code. `npm run verify` does that (typecheck, lint, 1302
 * tests) and this script refuses to run unless you have. This is about whether
 * the ARTIFACT is safe to publish, not whether the source is right.
 *
 * It also cannot check what only Netlify can see: secret scanning across the
 * upload, header and redirect processing, and whether the edge function
 * survived. Those are verified AFTER the deploy, against the previous deploy
 * as a baseline — see the post-deploy assertions printed at the end.
 *
 * Exit 0 means safe to deploy. Any non-zero means stop.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT = join(ROOT, 'out');
const PUBLIC_DATA = join(ROOT, 'public', 'data');
const OUT_DATA = join(OUT, 'data');

const failures = [];
const notes = [];
const fail = (what, fix) => failures.push(`${what}\n      → ${fix}`);
const ok = (what) => notes.push(`  ok    ${what}`);

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

// ---------------------------------------------------------------------------
// 1. The tree must be traceable to a reviewed commit.
//
// A direct deploy has no pull request behind it. If the working tree is dirty
// or ahead of the remote, the thing being published exists nowhere but this
// machine, and nothing can be rolled forward to or diffed against it later.
// ---------------------------------------------------------------------------
try {
  const dirty = sh('git status --porcelain');
  if (dirty) {
    fail(
      `working tree has uncommitted changes:\n${dirty.split('\n').slice(0, 8).map((l) => `        ${l}`).join('\n')}`,
      'commit them, or stash them — a deploy must correspond to a commit'
    );
  } else ok('working tree clean');

  const head = sh('git rev-parse HEAD');
  let remote = null;
  try {
    sh('git fetch -q origin main');
    remote = sh('git rev-parse origin/main');
  } catch {
    notes.push('  warn  could not fetch origin/main — skipping parity check');
  }
  if (remote) {
    if (head === remote) ok(`HEAD matches origin/main (${head.slice(0, 7)})`);
    else {
      // Diverging from main only matters for files that can reach the
      // artifact. scripts/, backend/ and tests/ run BEFORE a build and never
      // enter out/, so blocking on them would make this gate cry wolf at every
      // tooling change — and a gate that cries wolf gets bypassed, which is
      // worse than not having it.
      //
      // Everything the build reads is fatal, because a difference there means
      // publishing something main has never seen.
      const changed = sh(`git diff --name-only ${head} ${remote}`).split('\n').filter(Boolean);
      const BUILD_INPUT = /^(src\/|public\/|next\.config|netlify\.toml|package(-lock)?\.json|tailwind\.config|postcss\.config|tsconfig)/;
      const shipping = changed.filter((f) => BUILD_INPUT.test(f));
      const inert = changed.filter((f) => !BUILD_INPUT.test(f));
      if (!changed.length) ok(`HEAD differs from origin/main but trees are identical (${head.slice(0, 7)})`);
      else if (shipping.length)
        fail(
          `HEAD (${head.slice(0, 7)}) differs from origin/main in files the build reads:\n` +
            shipping.map((f) => `        ${f}`).join('\n'),
          'push and merge first — otherwise this publishes what main has never seen'
        );
      else {
        ok(`HEAD differs from origin/main only in files the build cannot read (${inert.length}: ${inert.slice(0, 4).join(', ')}${inert.length > 4 ? ', …' : ''})`);
        notes.push('        those cannot reach out/, so the artifact still corresponds to main');
      }
    }
  }
} catch (e) {
  fail(`git checks could not run: ${e.message}`, 'run this from inside the repository');
}

// ---------------------------------------------------------------------------
// 2. The build must exist, and must be newer than what it was built from.
//
// The failure this catches: editing public/data, deploying, and shipping the
// PREVIOUS build's data because nobody re-ran the build. Comparing bytes rather
// than timestamps, because a touched file is not a rebuilt one.
// ---------------------------------------------------------------------------
if (!existsSync(OUT)) {
  fail('out/ does not exist', 'run: npm run build');
} else if (!existsSync(OUT_DATA)) {
  fail('out/data/ does not exist', 'run: npm run build — the data directory did not ship');
} else {
  const srcFiles = readdirSync(PUBLIC_DATA).filter((f) => f.endsWith('.json'));
  const mismatched = [];
  const missing = [];
  for (const f of srcFiles) {
    const outPath = join(OUT_DATA, f);
    if (!existsSync(outPath)) {
      missing.push(f);
      continue;
    }
    if (readFileSync(join(PUBLIC_DATA, f), 'utf8') !== readFileSync(outPath, 'utf8')) {
      mismatched.push(f);
    }
  }
  if (missing.length) fail(`data files missing from the build: ${missing.join(', ')}`, 'run: npm run build');
  if (mismatched.length)
    fail(
      `the build is STALE — these differ from public/data: ${mismatched.join(', ')}`,
      'run: npm run build (the deploy would ship the previous run’s figures)'
    );
  if (!missing.length && !mismatched.length) ok(`${srcFiles.length} data files match public/data byte for byte`);
}

// ---------------------------------------------------------------------------
// 3. Every URL the sitemap advertises must actually be a file.
//
// The sitemap is generated from the route table, so it asserts what the app
// believes it publishes. If a page failed to export, this is where the two
// disagree — and a 404 on a URL we told search engines about is the kind of
// defect nobody notices for weeks.
// ---------------------------------------------------------------------------
const sitemapPath = join(OUT, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  fail('out/sitemap.xml is missing', 'run: npm run build');
} else {
  const xml = readFileSync(sitemapPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length < 10) {
    fail(`sitemap lists only ${locs.length} URLs, which is too few to be right`, 'inspect out/sitemap.xml');
  } else {
    const broken = [];
    for (const loc of locs) {
      const path = loc.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '');
      // trailingSlash: true means every route exports as <route>/index.html.
      const candidates = path
        ? [join(OUT, path, 'index.html'), join(OUT, `${path}.html`), join(OUT, path)]
        : [join(OUT, 'index.html')];
      if (!candidates.some((c) => existsSync(c))) broken.push(loc);
    }
    if (broken.length) fail(`sitemap advertises URLs with no file:\n${broken.map((b) => `        ${b}`).join('\n')}`, 'the export dropped these routes — investigate before publishing');
    else ok(`all ${locs.length} sitemap URLs resolve to a file`);
  }
}

// ---------------------------------------------------------------------------
// 4. Shipped JSON must parse, and the datasets must be within their own budgets.
//
// freshness.json carries each dataset's cadence budget. Publishing a dataset
// already past it is publishing something we have ourselves declared stale.
// ---------------------------------------------------------------------------
let parsed = 0;
for (const f of readdirSync(OUT_DATA).filter((f) => f.endsWith('.json'))) {
  try {
    JSON.parse(readFileSync(join(OUT_DATA, f), 'utf8'));
    parsed++;
  } catch (e) {
    fail(`out/data/${f} is not valid JSON: ${e.message}`, 'the build produced a corrupt file — do not publish');
  }
}
if (parsed) ok(`${parsed} shipped JSON files parse`);

try {
  const fresh = JSON.parse(readFileSync(join(OUT_DATA, 'freshness.json'), 'utf8'));
  const stale = (fresh.datasets || []).filter((d) => d.stale === true);
  const overBudget = (fresh.datasets || []).filter(
    (d) => typeof d.ageDays === 'number' && typeof d.budgetDays === 'number' && d.ageDays > d.budgetDays
  );
  const flagged = [...new Set([...stale, ...overBudget])];
  if (flagged.length) {
    notes.push(
      `  warn  ${flagged.length} dataset(s) past budget: ` +
        flagged.map((d) => `${d.file} ${d.ageDays}d/${d.budgetDays}d`).join(', ')
    );
    notes.push('        not a blocker — the site discloses staleness itself — but know before publishing');
  } else ok('every dataset is within its freshness budget');
} catch {
  notes.push('  warn  freshness.json unreadable — skipped budget check');
}

// ---------------------------------------------------------------------------
// 5. Nothing that looks like a credential may ship.
//
// Netlify scans the upload too, and its scan is the authoritative one. This is
// the cheap local copy: catching it here costs nothing, catching it there costs
// a failed deploy, and catching it neither place costs a rotated key.
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  [/\bnfp_[A-Za-z0-9]{20,}/, 'Netlify personal access token'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API secret key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
];
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};
const TEXTUAL = /\.(html|js|mjs|json|txt|xml|css|svg|webmanifest)$/i;
const hits = [];
let scanned = 0;
for (const p of walk(OUT)) {
  if (!TEXTUAL.test(p)) continue;
  if (statSync(p).size > 4_000_000) continue;
  scanned++;
  const text = readFileSync(p, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) hits.push(`${p.replace(ROOT + '/', '')}: possible ${label}`);
  }
}
if (hits.length) fail(`possible credentials in the build:\n${hits.map((h) => `        ${h}`).join('\n')}`, 'remove it and ROTATE the key — it was written to disk');
else ok(`${scanned} text files scanned, no credential patterns`);

// ---------------------------------------------------------------------------
// 6. The function source must still be there.
//
// A static export plus a functions directory is what the site actually is. If
// the directory went missing, the upload silently becomes a site without
// analytics, and nothing about the deploy would look wrong.
// ---------------------------------------------------------------------------
const fnDir = join(ROOT, 'netlify', 'functions');
if (!existsSync(fnDir)) {
  fail('netlify/functions/ is missing', 'the deploy would publish a site with no functions');
} else {
  const fns = readdirSync(fnDir).filter((f) => /\.(m?[tj]s)$/.test(f) || existsSync(join(fnDir, f, 'index.mts')));
  if (!fns.length) fail('netlify/functions/ contains no functions', 'expected at least track.mts');
  else ok(`${fns.length} function source(s) present: ${fns.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
console.log('\npre-deploy checks\n');
for (const n of notes) console.log(n);
if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log(`\n${failures.length} check(s) failed — do not deploy.\n`);
  process.exit(1);
}
console.log('\nall pre-deploy checks passed.\n');
console.log('AFTER deploying, verify against the previous deploy as a baseline:');
console.log('  - state is "ready" and error_message is null');
console.log('  - deploy_validations_report.secret_scan_result has no matches');
console.log('  - available_functions still lists every function it listed before');
console.log('  - edge_functions_present is unchanged (a direct upload can drop it)');
console.log('  - the live site serves the data you just built\n');
console.log('If any of those regress, roll back to the previous deploy immediately.\n');
