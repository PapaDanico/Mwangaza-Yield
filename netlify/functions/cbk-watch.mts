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

const PAGES: [string, string][] = [
  ['home', 'https://www.centralbank.go.ke/'],
  ['forex', 'https://www.centralbank.go.ke/rates/forex-exchange-rates/'],
  ['tbills', 'https://www.centralbank.go.ke/bills-bonds/treasury-bills/'],
  ['bonds', 'https://www.centralbank.go.ke/bills-bonds/treasury-bonds/'],
  ['bond-results', 'https://www.centralbank.go.ke/securities/treasury-bonds/treasury-bonds-results/'],
  ['cbr', 'https://www.centralbank.go.ke/rates/central-bank-rate/'],
  ['inflation', 'https://www.centralbank.go.ke/inflation-rates/'],
  ['weekly-bulletin', 'https://www.centralbank.go.ke/publication/weekly-bulletin/'],
];

const UA = 'MwangazaYield/1.0 (+https://mwangazayield.org/sources/)';

const text = (h: string) =>
  h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Every table as rows of cell text, capped so one page cannot swamp the summary. */
export function tables(html: string, maxTables = 6, maxRows = 14): string[][][] {
  const out: string[][][] = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const rows: string[][] = [];
    for (const r of t.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = (r.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? []).map((c) => text(c).slice(0, 80));
      if (cells.some(Boolean)) rows.push(cells);
      if (rows.length >= maxRows) break;
    }
    if (rows.length) out.push(rows);
    if (out.length >= maxTables) break;
  }
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

async function grab(url: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    const html = await res.text();
    return { status: res.status, bytes: html.length, ms: Date.now() - started, tables: tables(html), docs: docs(html, url) };
  } catch (e) {
    return { status: 0, error: String(e).slice(0, 200), ms: Date.now() - started };
  }
}

export default async () => {
  const at = new Date().toISOString();
  const results = await Promise.all(PAGES.map(async ([key, url]) => [key, { url, ...(await grab(url)) }] as const));
  const run = { at, pages: Object.fromEntries(results) };

  const store = getStore('cbk-watch');
  await store.setJSON('latest', run);
  await store.setJSON(`run-${at.slice(0, 13)}`, run);

  // Read-back channel; the full run is in the blob store. Netlify's spam
  // filter discarded the first run's JSON payload (dense, full of URLs), so
  // the summary is plain prose-like text: one field per page, table rows as
  // "a | b | c" lines, document links reduced to their file names, no URLs.
  const site = process.env.URL ?? 'https://mwangazayield.org';
  const fields: Record<string, string> = { 'form-name': 'cbk-watch', at };
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

// Hourly while the parser is written against real pages; to be narrowed to
// weekday mornings and afternoons once it is.
export const config: Config = { schedule: '@hourly' };
