/**
 * Read CBK's public pages from Netlify, where the network is open.
 *
 * WHY THIS EXISTS. Every other route to CBK is closed: GitHub Actions and
 * Vercel are suspended on billing, and the development sandbox's egress proxy
 * refuses centralbank.go.ke. Netlify's function runtime is the one compute
 * surface with real network that this project already pays for, and a
 * scheduled function costs invocations, not build credits.
 *
 * WHY A SCHEDULE IS ALLOWED HERE. The repository forbids scheduled functions
 * because one once delivered push alerts TO people. This one only READS public
 * pages and sends nothing to anyone; the owner approved a named exception on
 * 3 Oct 2026, and tests/unit/no-server-personal-data.test.ts pins it to
 * centralbank.go.ke and this site's own form.
 *
 * WHAT IT DOES. Fetches a fixed list of CBK pages, extracts every table's rows
 * and every document link (PDF/CSV/XLSX), and writes the result to the
 * `cbk-watch` blob store (`latest`, plus one copy per run hour). It then posts
 * a compact summary to the hidden `cbk-watch` Netlify form, which is the
 * read-back channel: submissions are readable through Netlify's API, so a
 * maintainer, or an agent session that cannot reach CBK itself, can see what
 * CBK published and transcribe or parse it into public/data with provenance.
 *
 * WHAT IT DOES NOT DO. It changes nothing a reader sees and stores nothing
 * about anyone. Figures still reach the site only through a reviewed commit,
 * keeping CLAUDE.md's "route recorded" rule intact.
 */
import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { extractText, getDocumentProxy } from 'unpdf';

const PAGES: [string, string][] = [
  ['home', 'https://www.centralbank.go.ke/'],
  ['forex', 'https://www.centralbank.go.ke/rates/forex-exchange-rates/'],
  ['tbills', 'https://www.centralbank.go.ke/bills-bonds/treasury-bills/'],
  ['bonds', 'https://www.centralbank.go.ke/bills-bonds/treasury-bonds/'],
  ['cbr', 'https://www.centralbank.go.ke/rates/central-bank-rate/'],
  ['inflation', 'https://www.centralbank.go.ke/inflation-rates/'],
  ['weekly-bulletin', 'https://www.centralbank.go.ke/publication/weekly-bulletin/'],
];

const UA = 'MwangazaYield/1.0 (+https://mwangazayield.org/sources/)';

const text = (h: string) =>
  h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Every table as rows of cell text, capped so one page cannot swamp the summary. */
export function tables(html: string, maxTables = 12, keep = 14): string[][][] {
  const out: string[][][] = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const rows: string[][] = [];
    for (const r of t.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = (r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map((c) => text(c).slice(0, 80));
      if (cells.some(Boolean)) rows.push(cells);
    }
    /* Header plus the NEWEST rows. Several CBK tables run oldest-first, so the
     * first run kept 2012-2019 history and missed every current figure. */
    if (rows.length > keep) out.push([...rows.slice(0, 2), ['…'], ...rows.slice(-(keep - 3))]);
    else if (rows.length) out.push(rows);
    if (out.length >= maxTables) break;
  }
  return out;
}

/** CBK's "Key Rates" and "Daily KES Exchange Rates" sidebar, which every page
 *  carries: label -> value, with the date CBK prints beside it. Read from the
 *  first run, 4 Oct 2026 — e.g. "Central Bank Rate | 8.75% | 11/08/2026",
 *  "US DOLLAR | 129.76", "Posted On: 02-10-2026". */
export const KEY_LABELS = [
  'US DOLLAR', 'Central Bank Rate', 'KESONIA', 'CBK Discount Window', '91-Day T-Bill',
  'Inflation Rate', 'Lending Rate', 'Deposit Rate', 'Savings Rate',
];
export function keyRates(all: string[][][]): Record<string, { value: string; date: string | null }> {
  const out: Record<string, { value: string; date: string | null }> = {};
  let fxPosted: string | null = null;
  for (const t of all) for (const row of t) {
    const posted = row.join(' ').match(/Posted On:\s*([0-9-]+)/i);
    if (posted) fxPosted = posted[1];
    const label = KEY_LABELS.find((l) => row[0]?.toLowerCase() === l.toLowerCase());
    if (label && row[1] && !out[label]) out[label] = { value: row[1], date: row[2] ?? null };
  }
  if (out['US DOLLAR'] && !out['US DOLLAR'].date) out['US DOLLAR'].date = fxPosted;
  return out;
}

/** Document links in page order. */
export function docs(html: string, base: string, max = 25): string[] {
  const seen = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+\.(?:pdf|csv|xlsx?))["']/gi)) {
    try {
      seen.add(new URL(m[1], base).href);
    } catch {
      /* malformed href */
    }
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** The results notices among a page's document links, newest first as CBK
 *  lists them. Only CBK-hosted files: the reader never follows a link off-site. */
export function resultsPdfs(links: string[], max = 3): string[] {
  /* NEWEST FIRST BY THE DATE IN THE FILE NAME. CBK names every results
   * notice "... DATED dd-mm-yyyy" (or dd.mm.yyyy). The bonds page lists
   * documents oldest-first, and CBK's numeric upload prefix is NOT a clock —
   * a 2018 notice carries 2129006739, above this year's 2069542746 — so both
   * page order and prefix picked 2018 and 2020 notices on 5 Oct. */
  const dated = (u: string) => {
    const m = decodeURIComponent(u).match(/dated\s*(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})/i);
    return m ? Number(`${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}`) : 0;
  };
  return links
    .filter((u) => /\.pdf$/i.test(u) && /result/i.test(decodeURIComponent(u)))
    .filter((u) => new URL(u).hostname.endsWith('centralbank.go.ke'))
    .sort((a, b) => dated(b) - dated(a))
    .slice(0, max);
}

/** A PDF's text layer, whitespace collapsed. Results notices are text PDFs;
 *  a scanned one returns '' and is reported as such rather than guessed at. */
async function pdfText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return `status ${res.status}`;
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text: t } = await extractText(pdf, { mergePages: true });
  return (t as string).replace(/\s+/g, ' ').trim() || '(no text layer)';
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A weekly bulletin's date from its file name, which CBK writes several ways:
 *  "Weekly_CBK_Bulletin_October_16_2026", "..._23_October_2026",
 *  "Weekly Bulletin - January 8 2016", "29-01-2016". 0 when none is found. */
export function bulletinDate(name: string): number {
  const n = decodeURIComponent(name).toLowerCase().replace(/[_,]+/g, ' ');
  const num = n.match(/\b(\d{1,2})[-.](\d{1,2})[-.](20\d{2})\b/);
  if (num) return Number(`${num[3]}${num[2].padStart(2, '0')}${num[1].padStart(2, '0')}`);
  const mi = MONTHS.findIndex((m) => n.includes(m));
  const year = n.match(/\b(20\d{2})\b/);
  if (mi < 0 || !year) return 0;
  const rest = n.replace(year[1], ' ');
  const day = rest.match(/\b(\d{1,2})\b/);
  return day ? Number(`${year[1]}${String(mi + 1).padStart(2, '0')}${day[1].padStart(2, '0')}`) : 0;
}

/** The newest weekly bulletin PDF among a page's links, CBK-hosted only. */
export function newestBulletin(links: string[]): string | null {
  return (
    links
      .filter((u) => /\.pdf$/i.test(u) && /bulletin/i.test(decodeURIComponent(u)))
      .filter((u) => new URL(u).hostname.endsWith('centralbank.go.ke'))
      .map((u) => ({ u, d: bulletinDate(u.split('/').pop() ?? '') }))
      .filter((x) => x.d > 0)
      .sort((a, b) => b.d - a.d)[0]?.u ?? null
  );
}

const lastNumber = (run: string) => run.trim().split(/\s+/).at(-1) ?? null;

/**
 * The figures this site carries from a Weekly Bulletin, read from its text.
 * Each is null when its sentence or table is not found, never a guess: CBK
 * rewords the front page occasionally, and a missed match should show as a
 * gap in the form, not as a wrong number. Pinned against the 23 Oct 2026
 * bulletin in tests/unit/cbk-watch-parse.test.ts.
 */
export function bulletinFigures(t: string) {
  const reserves = t.match(/USD ([\d,]+) million \(([\d.]+) months of import cover\) as of (\w+ \d{1,2})/);
  const fx = t.match(/exchanged at KSh ([\d.]+) per U\.S\. dollar on (\w+ \d{1,2})/);
  const gdp = t.match(/grew by ([\d.]+) percent in the (\w+) quarter of (\d{4})/);
  const nums = '((?:\\s+[\\d,]+\\.\\d{2})+)';
  const dom = t.match(new RegExp(`Gross Domestic Debt \\(3\\+4\\+5\\)${nums}`));
  const domHead = t.match(/Government Domestic Debt \(KSh Billion\)((?:\s+\d{1,2}-\w{3}-\d{2})+)/);
  const pub = t.match(new RegExp(`Public\\s+Debt \\(Ksh Bn\\)${nums}`));
  const pubHead = t.match(/Table \d+: Public Debt((?:\s+\w{3}-\d{2,4}\*?)+)/);
  return {
    reservesUSDm: reserves?.[1] ?? null,
    importCoverMonths: reserves?.[2] ?? null,
    reservesAsOf: reserves?.[3] ?? null,
    usdKes: fx?.[1] ?? null,
    usdKesOn: fx?.[2] ?? null,
    gdpGrowthPct: gdp?.[1] ?? null,
    gdpQuarter: gdp ? `${gdp[2]} quarter ${gdp[3]}` : null,
    domesticDebtKSHbn: dom ? lastNumber(dom[1]) : null,
    domesticDebtAsOf: domHead ? lastNumber(domHead[1]) : null,
    publicDebtKSHbn: pub ? lastNumber(pub[1]) : null,
    publicDebtAsOf: pubHead ? lastNumber(pubHead[1]) : null,
  };
}

/**
 * The three weighted average rates of ACCEPTED bids from a T-bill results
 * notice, with its value date. These are the rates tbills.json carries, so an
 * archive of them is what a T-bill bid range can be calibrated against. CBK's
 * T-bill page links every weekly notice but renders only the first ten rows
 * of its history table (2016), so the archive is built from the notices.
 */
export function tbillNoticeRates(t: string): { dated: string; r91: number; r182: number; r364: number } | null {
  const war = t.match(/Weighted Average Interest Rate of accepted bids\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%/i);
  const dated = t.match(/DATED\s+(\d{2})[-.\/](\d{2})[-.\/](\d{4})/i);
  if (!war || !dated) return null;
  return { dated: `${dated[3]}-${dated[2]}-${dated[1]}`, r91: +war[1], r182: +war[2], r364: +war[3] };
}

/** How many past T-bill notices one run adds to the archive. Kept small:
 *  a scheduled function has a short time limit, and the archive fills
 *  across runs instead (two a weekday). */
export const TBILL_BACKFILL_PER_RUN = 6;

/**
 * Bonds the site is missing a CBK-sourced figure for, searched for on every
 * run. IFB1/2015/012 (6 Oct 2026): outstanding, coupon confirmed by NSE and
 * the DhowCSD register, but no CBK results notice found by search, and
 * bonds.json needs its auction yield. Remove an entry once it is entered —
 * IFB1/2015/012 was found on the first run (6 Oct, 11.556% at 30/03/2015) and removed.
 */
export const LOOKUP: { isin: string; code: RegExp }[] = [
];

/** Table rows and document links on a page that mention a LOOKUP bond. */
export function lookup(html: string, base: string, wanted = LOOKUP): { rows: string[]; docs: string[] } {
  const rows: string[] = [];
  for (const r of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const t = text(r);
    if (wanted.some((l) => t.includes(l.isin) || l.code.test(t))) rows.push(t.slice(0, 300));
  }
  const found = docs(html, base, 5000).filter((u) => {
    const n = decodeURIComponent(u);
    return wanted.some((l) => n.includes(l.isin) || l.code.test(n));
  });
  return { rows: rows.slice(0, 20), docs: found.slice(0, 10) };
}

async function grab(url: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const html = await res.text();
    return { status: res.status, bytes: html.length, ms: Date.now() - started, tables: tables(html), docs: docs(html, url), allDocs: docs(html, url, 5000), lookup: lookup(html, url) };
  } catch (e) {
    return { status: 0, error: String(e).slice(0, 200), ms: Date.now() - started };
  }
}

export default async () => {
  const at = new Date().toISOString();
  const results = await Promise.all(PAGES.map(async ([key, url]) => [key, { url, ...(await grab(url)) }] as const));
  const run = { at, pages: Object.fromEntries(results) };

  // Open the newest results notices on the bonds and T-bill pages, so the
  // figures (rates, amounts, prices) arrive without anyone pasting a document.
  // The two newest results from EACH page, so a busy T-bill week cannot
  // crowd the bond results out (or the reverse).
  const pageDocs = (key: string) =>
    ((results.find(([k]) => k === key)?.[1] as { allDocs?: string[] } | undefined)?.allDocs ?? []);
  const picks = [...new Set([...resultsPdfs(pageDocs('bonds'), 2), ...resultsPdfs(pageDocs('tbills'), 2)])];
  const notices: Record<string, string> = {};
  for (const u of picks) {
    const name = decodeURIComponent(u.split('/').pop() ?? u);
    notices[name] = await pdfText(u).catch((e) => `error ${String(e).slice(0, 120)}`);
  }
  (run as Record<string, unknown>).notices = notices;

  // The newest Weekly Bulletin: reserves, debt and growth, which no results
  // notice carries and which otherwise had to be pasted in by hand each Friday.
  const bulletinUrl = newestBulletin(pageDocs('weekly-bulletin'));
  const bulletinText = bulletinUrl ? await pdfText(bulletinUrl).catch((e) => `error ${String(e).slice(0, 120)}`) : '';
  const bulletin = bulletinUrl
    ? { file: decodeURIComponent(bulletinUrl.split('/').pop() ?? ''), ...bulletinFigures(bulletinText) }
    : null;
  (run as Record<string, unknown>).bulletin = bulletin;

  // T-bill rate archive, filled a few notices per run (see tbillNoticeRates).
  const store0 = getStore('cbk-watch');
  const archive = ((await store0.get('tbill-history', { type: 'json' }).catch(() => null)) ?? {}) as Record<
    string,
    ReturnType<typeof tbillNoticeRates> | 'unreadable'
  >;
  const unseen = resultsPdfs(pageDocs('tbills'), 1000)
    .filter((u) => !(decodeURIComponent(u.split('/').pop() ?? u) in archive))
    .slice(0, TBILL_BACKFILL_PER_RUN);
  await Promise.all(
    unseen.map(async (u) => {
      const name = decodeURIComponent(u.split('/').pop() ?? u);
      const t = await pdfText(u).catch(() => '');
      archive[name] = tbillNoticeRates(t) ?? 'unreadable';
    })
  );
  await store0.setJSON('tbill-history', archive);

  // Wanted bonds (LOOKUP): matching rows, and the text of up to two notices.
  const hits = results.map(([, p]) => (p as { lookup?: { rows: string[]; docs: string[] } }).lookup);
  const lookRows = hits.flatMap((h) => h?.rows ?? []);
  const lookDocs = [...new Set(hits.flatMap((h) => h?.docs ?? []))];
  const lookText: string[] = [];
  for (const u of lookDocs.slice(0, 2)) {
    const t = await pdfText(u).catch((e) => `error ${String(e).slice(0, 120)}`);
    lookText.push(`=== ${decodeURIComponent(u.split('/').pop() ?? u)}\n${t.slice(0, 3000)}`);
  }

  const store = getStore('cbk-watch');
  await store.setJSON('latest', run);
  await store.setJSON(`run-${at.slice(0, 13)}`, run);

  // Read-back channel; the full run is in the blob store. Netlify's spam
  // filter discarded the first run's JSON payload (dense, full of URLs), so
  // the summary is plain prose-like text: one field per page, table rows as
  // "a | b | c" lines, document links reduced to their file names, no URLs.
  const site = process.env.URL ?? 'https://mwangazayield.org';
  const fields: Record<string, string> = { 'form-name': 'cbk-watch', at };
  // The parsed figures first, so a reader of the form sees the answer before the evidence.
  const allTables = results.flatMap(([, p]) => (p as { tables?: string[][][] }).tables ?? []);
  const rates = keyRates(allTables);
  fields.extract = Object.entries(rates)
    .map(([k, v]) => `${k}: ${v.value}${v.date ? ` (${v.date})` : ''}`)
    .join('\n');
  fields.results = Object.entries(notices)
    .map(([n, t]) => `=== ${n}\n${t.slice(0, 2400)}`)
    .join('\n')
    .slice(0, 9000);
  fields.bulletin = bulletin
    ? Object.entries(bulletin).map(([k, v]) => `${k}: ${v ?? 'not found'}`).join('\n')
    : 'no bulletin link found on the weekly-bulletin page';
  fields['tbill-history'] = Object.values(archive)
    .filter((r): r is NonNullable<ReturnType<typeof tbillNoticeRates>> => !!r && r !== 'unreadable')
    .sort((a, b) => a.dated.localeCompare(b.dated))
    .map((r) => `${r.dated} ${r.r91} ${r.r182} ${r.r364}`)
    .join('\n') + `\nunreadable: ${Object.values(archive).filter((r) => r === 'unreadable').length}`;
  fields.lookup = [
    `wanted: ${LOOKUP.map((l) => l.isin).join(', ')}`,
    ...lookRows.map((r) => `row ${r}`),
    ...lookDocs.map((u) => `doc ${decodeURIComponent(u.split('/').pop() ?? '')}`),
    ...lookText,
  ].join('\n').slice(0, 8000);
  for (const [key, page] of results) {
    const p = page as { status: number; tables?: string[][][]; docs?: string[]; error?: string };
    const lines = [`status ${p.status}${p.error ? ` error ${p.error}` : ''}`];
    for (const t of p.tables ?? []) {
      lines.push('--- table');
      for (const r of t) lines.push(r.join(' | '));
    }
    for (const d of p.docs ?? []) lines.push(`doc ${decodeURIComponent(d.split('/').pop() ?? '')}`);
    fields[key] = lines.join('\n').slice(0, 6000);
  }
  await fetch(`${site}/cbk-watch-form.html`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }).catch(() => undefined);
};

// 06:00 and 13:00 UTC on weekdays = 09:00 and 16:00 Nairobi: after CBK's
// morning FX card and after the afternoon auction notices.
export const config: Config = { schedule: '0 6,13 * * 1-5' };
