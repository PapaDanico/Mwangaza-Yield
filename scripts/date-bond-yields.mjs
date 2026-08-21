/**
 * Give every bond yield a date, and make it the latest one we actually hold.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * bonds.json carried 16 yields with `ytmAsOf: null` and 5 more whose date was
 * years behind an auction result sitting in auction-results.json all along.
 * Nothing was missing from the platform. The two files had simply never been
 * reconciled, so the yield curve, TopYields and the calculator were reading
 * numbers that could not be aged:
 *
 *   IFB1/2019/016   12.507 from 2019-10-28, superseded 2026-08-17 at 12.196
 *   FXD1/2022/010   13.2   undated,         superseded 2026-07-13 at 12.7822
 *   FXD1/2010/025   11.25  undated — and 11.25 is its COUPON, not a yield
 *
 * An undated yield is worse than a stale one. YieldCurveChart already refuses
 * to narrate a curve when any point is undated, precisely because it cannot
 * check the ages — so these nulls were suppressing the chart's explanation for
 * a reason the reader was never shown. Dating them lets the age rules work.
 *
 * That the existing numbers are mostly ROUNDED versions of the auction results
 * — 13.9 against 13.9234, 14.2 against 14.2304, 14.4432 exactly — is what
 * establishes the match is real rather than coincidental. They came from these
 * auctions; only the date was dropped.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * Touch `couponRate`. The coupon is a legal term of the bond and does not move
 * with the market; expand_universe.py owns correcting it from auction facts.
 *
 * Overwrite a yield that is already at least as fresh. The comparison is a
 * strict `>` on the date, so a mark sourced from somewhere better than an
 * auction result — FXD1/2012/015 is priced from CBK's August 2026 switch
 * prospectus — is not replaced by a same-day auction row.
 *
 * Accept a result whose yield is implausibly far from the coupon. That is the
 * signature of a matched-the-wrong-security bug, and registry.py takes the
 * same position: skip and report rather than write a confident error.
 *
 * Reach the network. It reconciles two files this repository already has,
 * which is why it runs here at all — the scrapers cannot reach CBK from a
 * session.
 *
 * USAGE
 *   node scripts/date-bond-yields.mjs           # report only
 *   node scripts/date-bond-yields.mjs --write   # apply
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BONDS = join(ROOT, 'public', 'data', 'bonds.json');
const RESULTS = join(ROOT, 'public', 'data', 'auction-results.json');

/** FXD1/2022/10 and FXD1/2022/010 are the same bond. Mirrors common.py. */
function normalise(code) {
  const m = /^([A-Z]+)(\d)\/(\d{4})\/(\d+(?:\.\d+)?)$/.exec(String(code).trim().toUpperCase());
  if (!m) return String(code).trim().toUpperCase();
  return `${m[1]}${m[2]}/${m[3]}/${Number(m[4])}`;
}

/**
 * A yield this far from the coupon means the row is not this bond. Deliberately
 * wide: FXD1/2010/025 legitimately cleared 9.84% against an 11.25% coupon, and
 * 2023's issues cleared several points above theirs. It is a wrong-security
 * guard, not a plausibility opinion.
 */
const MAX_SPREAD_PP = 10;

const bonds = JSON.parse(readFileSync(BONDS, 'utf8'));
const results = JSON.parse(readFileSync(RESULTS, 'utf8'));

/** Latest dated result per bond that actually carries a cleared yield. */
const latest = new Map();
for (const r of results) {
  const rate = r.weightedAverageRate;
  if (!r.auctionDate || rate === null || rate === undefined) continue;
  const key = normalise(r.issueCode);
  const held = latest.get(key);
  if (!held || r.auctionDate > held.auctionDate) latest.set(key, { ...r, rate });
}

const updated = [];
const skipped = [];
const untouched = [];

for (const bond of bonds) {
  const hit = latest.get(normalise(bond.issueCode));
  if (!hit) {
    untouched.push(`${bond.issueCode} — no dated auction result`);
    continue;
  }
  // Strict >: an equally fresh auction row does not displace a mark we already
  // have, which may have come from a better document.
  if (bond.ytmAsOf && !(hit.auctionDate > bond.ytmAsOf)) continue;

  if (bond.couponRate !== null && Math.abs(hit.rate - bond.couponRate) > MAX_SPREAD_PP) {
    skipped.push(
      `${bond.issueCode} — result ${hit.rate}% is ${Math.abs(hit.rate - bond.couponRate).toFixed(1)}pp ` +
        `from its ${bond.couponRate}% coupon; likely a different security`
    );
    continue;
  }

  updated.push({
    code: bond.issueCode,
    from: `${bond.ytmGross}${bond.ytmAsOf ? ` @${bond.ytmAsOf}` : ' (undated)'}`,
    to: `${hit.rate} @${hit.auctionDate}`,
  });
  bond.ytmGross = hit.rate;
  bond.ytmAsOf = hit.auctionDate;
  if (hit.sourceUrl) bond.source = hit.sourceUrl;
}

const write = process.argv.includes('--write');

console.log(`bond yield reconciliation${write ? '' : ' (dry run — pass --write to apply)'}\n`);
for (const u of updated) console.log(`  set   ${u.code.padEnd(18)} ${u.from}  ->  ${u.to}`);
for (const s of skipped) console.log(`  SKIP  ${s}`);
for (const u of untouched) console.log(`  --    ${u}`);

const stillUndated = bonds.filter((b) => !b.ytmAsOf).length;
console.log(
  `\n  ${updated.length} updated, ${skipped.length} skipped, ${bonds.length} bonds, ` +
    `${stillUndated} still undated`
);

if (write && updated.length) {
  writeFileSync(BONDS, `${JSON.stringify(bonds, null, 2)}\n`);
  console.log('  written to public/data/bonds.json');
}
