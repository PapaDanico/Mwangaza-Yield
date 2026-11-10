/**
 * Reads the CBK documents behind archive rows that still miss a core field.
 *
 * WHY THIS EXISTS. The Sources page publishes how complete the auction archive
 * is, and 51 of 404 rows were missing at least one of six fields, all of them
 * 2008 to 2019 results documents. A session cannot reach CBK (egress-blocked),
 * and the Python parser that produced those rows cannot run without network, so
 * the only way to a source figure is a fetch from here, where egress is open.
 * `cbk-watch` already does this for the newest notices; this does it for the
 * old ones the archive points at, and does nothing else.
 *
 * WHY A SEPARATE FUNCTION. cbk-watch carries the daily FX, T-bill and bulletin
 * read on a 30-second limit. Fetching a few dozen extra PDFs inside it would put
 * that read at risk of being killed before it posts. This one has its own
 * budget, reads a handful of documents per run, remembers which it has read, and
 * returns immediately once nothing is left, so the schedule is harmless to leave
 * in place and can be removed once the archive is complete.
 *
 * READ-ONLY. It fetches CBK-hosted PDFs the archive already cites, extracts
 * their text and posts it to the hidden `cbk-watch` form, as cbk-watch does. It
 * writes nothing to the site: figures reach `public/data` only through a commit
 * with a source note, by a person reading the text. Pinned by
 * `no-server-personal-data.test.ts`.
 */
import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { extractText, getDocumentProxy } from 'unpdf';
import archive from '../../public/data/auction-results.json';

const UA = 'MwangazaYield/1.0 (+https://mwangazayield.org/sources/)';
const CORE = ['auctionDate', 'couponRate', 'pricePer100', 'amountOfferedKESM', 'amountAcceptedKESM', 'bidsReceivedKESM'] as const;

/** Documents read per run, and the time the whole run may take. */
export const GAP_DOCS_PER_RUN = 8;
export const GAP_DEADLINE_MS = 22_000;
/** Characters of each document posted. Results notices are one or two pages. */
const TEXT_CHARS = 3_200;

interface Row {
  id: string;
  sourceUrl?: string;
  [key: string]: unknown;
}

export interface GapDoc {
  url: string;
  file: string;
  rows: { id: string; missing: string[] }[];
}

const absent = (v: unknown) => v === null || v === undefined || v === '' || v === 0;

/**
 * The CBK documents behind rows that miss at least one core field, each with
 * the rows and fields it is wanted for. CBK-hosted https links only: this never
 * follows a link off-site. Recomputed from the shipped archive on every run, so
 * a row that gets fixed stops being fetched without anyone editing a list.
 */
export function gapDocs(rows: Row[]): GapDoc[] {
  const byUrl = new Map<string, GapDoc>();
  for (const r of rows) {
    const missing = CORE.filter((f) => absent(r[f]));
    if (missing.length === 0 || !r.sourceUrl) continue;
    let href: string;
    try {
      const u = new URL(r.sourceUrl);
      if (u.protocol !== 'https:' || !u.hostname.endsWith('centralbank.go.ke') || !/\.pdf$/i.test(u.pathname)) continue;
      href = u.href;
    } catch {
      continue;
    }
    const doc = byUrl.get(href) ?? { url: href, file: decodeURIComponent(href.split('/').pop() ?? href), rows: [] };
    doc.rows.push({ id: r.id, missing: [...missing] });
    byUrl.set(href, doc);
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function pdfText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return `status ${res.status}`;
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return (text as string).replace(/\s+/g, ' ').trim() || '(no text layer)';
}

export default async () => {
  const started = Date.now();
  const store = getStore('cbk-watch');
  const done = ((await store.get('gap-docs-read', { type: 'json' }).catch(() => null)) ?? {}) as Record<string, string>;
  const todo = gapDocs(archive as unknown as Row[]).filter((d) => !done[d.url]).slice(0, GAP_DOCS_PER_RUN);
  if (todo.length === 0) return;

  const read: { doc: GapDoc; text: string }[] = [];
  await Promise.all(
    todo.map(async (doc) => {
      const text = await pdfText(doc.url, GAP_DEADLINE_MS - (Date.now() - started)).catch((e) => `error ${String(e).slice(0, 100)}`);
      // A timeout or a server error is not a reading: leave it for a later run.
      if (/^status [45]\d\d$/.test(text) || /^error /.test(text)) return;
      read.push({ doc, text });
    })
  );
  if (read.length === 0) return;

  const site = process.env.URL ?? 'https://mwangazayield.org';
  const body = read
    .map(({ doc, text }) => `=== ${doc.file}\nwanted: ${doc.rows.map((r) => `${r.id} [${r.missing.join(',')}]`).join('; ')}\n${text.slice(0, TEXT_CHARS)}`)
    .join('\n')
    .slice(0, 30_000);
  const res = await fetch(`${site}/cbk-watch-form.html`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'form-name': 'cbk-watch', at: new Date().toISOString(), gapdocs: body }),
  }).catch(() => null);
  // Marked read only once the text has been delivered.
  if (!res || res.status >= 400) return;
  for (const { doc, text } of read) done[doc.url] = text === '(no text layer)' ? 'no text layer' : 'read';
  await store.setJSON('gap-docs-read', done);
};

// Every ten minutes until the archive's source documents have all been read;
// each run after that returns at once. Remove this schedule when it is done.
export const config: Config = { schedule: '*/10 * * * *' };
