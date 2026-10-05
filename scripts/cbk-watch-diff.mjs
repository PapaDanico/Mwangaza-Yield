#!/usr/bin/env node
/**
 * Compare a cbk-watch `extract` field against what public/data holds, and
 * print what CBK has published that this site does not.
 *
 *   node scripts/cbk-watch-diff.mjs extract.txt      # or pipe it on stdin
 *
 * WHY. The cbk-watch Netlify function reads CBK's "Key Rates" sidebar twice
 * every weekday and posts it to a form. Turning that into a data update was a
 * by-hand comparison, every time. This does the comparison and prints a record
 * stub for each figure that moved, carrying `via: 'cbk-home'` and a sourceNote.
 *
 * WHAT IT DOES NOT DO: write anything. A figure reaches public/data only
 * through a reviewed commit (CLAUDE.md, "route recorded"). In particular the
 * sidebar's 91-day figure is dated by CBK's Monday VALUE date and rounded to
 * three places, so it can confirm tbills.json but never replace the results
 * notice, which carries the amounts the ledger needs.
 */
import { readFileSync } from 'node:fs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

/** "US DOLLAR: 129.76 (02-10-2026)" lines -> { label: { value, date } }. */
export function parseExtract(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*([0-9.]+)\s*%?\s*(?:\(([^)]*)\))?/);
    if (m) out[m[1].trim().toUpperCase()] = { value: Number(m[2]), date: m[3]?.trim() ?? null };
  }
  return out;
}

/** CBK writes dates as 02-10-2026, 11/08/2026 or "August,2026". ISO, or null. */
export function isoDate(s) {
  if (!s) return null;
  const d = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (d) return `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
  const mo = s.match(/([A-Za-z]+)\W*(\d{4})/);
  if (mo && MONTHS.includes(mo[1].toLowerCase())) {
    return `${mo[2]}-${String(MONTHS.indexOf(mo[1].toLowerCase()) + 1).padStart(2, '0')}-01`;
  }
  return null;
}

const latest = (rows, pred) =>
  rows.filter(pred).sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) ?? null;

/** One finding per sidebar figure: same, newer, or a conflict to look at. */
export function diff(ex, { macro, tbills, cpiHistory }) {
  const findings = [];
  const check = (label, held, tol, stub) => {
    const got = ex[label];
    if (!got) return findings.push({ label, status: 'missing from extract' });
    const date = isoDate(got.date);
    if (!held) return findings.push({ label, status: 'new', got, date, stub: stub(got, date) });
    const sameValue = Math.abs(held.value - got.value) <= tol;
    if (sameValue) return findings.push({ label, status: 'same', held, got, date });
    const newer = date && held.date && date > held.date;
    // CBK's sidebar can lag the site: the September CPI was entered from the
    // KNBS release while the sidebar still read August.
    const older = date && held.date && date < held.date;
    // CBK's sidebar 91-day is the PREVIOUS auction's rate shown under the new
    // value date — confirmed 5 Oct: sidebar 8.778, results notice 'Last
    // Auction' 8.7781. A match on the held previous rate is a lag, not a clash.
    const lagging = held.previous != null && Math.abs(held.previous - got.value) <= tol;
    findings.push({ label, status: lagging ? 'lagging' : newer ? 'newer' : older ? 'older' : 'conflict', held, got, date, stub: newer && !lagging ? stub(got, date) : undefined });
  };
  const note = (label, raw) =>
    `CBK website Key Rates sidebar, "${label}" as read by the cbk-watch function` +
    (raw ? ` (CBK's date: ${raw})` : '') + '.';

  check('US DOLLAR', latest(macro, (r) => r.indicator === 'FX_USD_KES'), 0.005, (g, d) => ({
    id: `fx-${d}`, indicator: 'FX_USD_KES', value: g.value, date: d, via: 'cbk-home',
    sourceNote: note('US DOLLAR', g.date),
  }));
  check('CENTRAL BANK RATE', latest(macro, (r) => r.indicator === 'CBR'), 0.001, (g, d) => ({
    id: `cbr-${d}`, indicator: 'CBR', value: g.value, date: d, via: 'cbk-home',
    sourceNote: note('Central Bank Rate', g.date),
  }));
  // Rounded to 3dp by CBK on the sidebar: confirms, never replaces, the notice.
  const t91 = latest(tbills, (r) => r.tenorDays === 91);
  // CBK dates the sidebar figure by the Monday VALUE date; tbills.json holds
  // the Thursday auction day. Compare like with like, or every week reads
  // as "newer" when it is the same auction.
  const valueDate = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  };
  check('91-DAY T-BILL', t91 && { value: t91.discountRate, previous: t91.previousDiscountRate, date: valueDate(t91.auctionDate) }, 0.0006, () => ({
    action: 'enter the results notice for this auction (the sidebar carries no amounts)',
  }));
  check('INFLATION RATE', latest(cpiHistory, (r) => r.indicator === 'CPI'), 0.05, (g, d) => ({
    id: `cpi-${d}`, indicator: 'CPI', value: g.value, date: d, unit: '% y/y', source: 'CBK',
    series: '12-Month Inflation', via: 'cbk-home', sourceNote: note('Inflation Rate', g.date),
  }));
  return findings;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const text = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : readFileSync(0, 'utf8');
  const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
  const findings = diff(parseExtract(text), {
    macro: read('macro.json'), tbills: read('tbills.json'), cpiHistory: read('cpi-history.json'),
  });
  for (const f of findings) {
    const held = f.held ? `held ${f.held.value} (${f.held.date})` : 'nothing held';
    const got = f.got ? `CBK ${f.got.value} (${f.got.date ?? 'undated'})` : '';
    console.log(`${f.status.toUpperCase().padEnd(9)} ${f.label}: ${got}; ${held}`);
    if (f.stub) console.log(`          ${JSON.stringify(f.stub)}`);
  }
  if (findings.some((f) => f.status === 'conflict')) process.exitCode = 2;
}
