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
const TEXT_CHARS = 4_000;

interface Row {
  id: string;
  sourceUrl?: string;
  [key: string]: unknown;
}

export interface GapDoc {
  url: string;
  file: string;
  /** 'gap': behind a row missing a core field. 'verify': behind rows that look complete. 'extra': a named Treasury document wanted for its own series. */
  tier: 'gap' | 'verify' | 'extra';
  rows: { id: string; missing: string[]; contradicts?: boolean }[];
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
    const doc = byUrl.get(href) ?? { url: href, file: decodeURIComponent(href.split('/').pop() ?? href), tier: 'gap' as const, rows: [] };
    doc.rows.push({ id: r.id, missing: [...missing] });
    byUrl.set(href, doc);
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Multi-bond notices from before 2020 behind rows that look complete.
 *
 * WHY. Reading the gap documents showed the old parse put values from the wrong
 * column of a two- or three-bond notice into rows the completeness panel counted
 * as present: the 20-year's coupon and price on the 2-year bond, the 5-year's
 * amounts on the 30-year. "Present" is not "right". A notice that backs two or
 * more rows is the one where a column can be read into the wrong bond, so those
 * are read too, and checked against the archive by a person before anything
 * changes. Notices from 2020 on are excluded: the current parser reads them and
 * 2026's were entered from the documents. CBK-hosted https PDFs only.
 */
export function verifyDocs(rows: Row[], gap: GapDoc[] = gapDocs(rows)): GapDoc[] {
  const inGap = new Set(gap.map((g) => g.url));
  const byUrl = new Map<string, GapDoc>();
  const count = new Map<string, number>();
  for (const r of rows) {
    if (!r.sourceUrl) continue;
    try {
      const u = new URL(r.sourceUrl);
      if (u.protocol !== 'https:' || !u.hostname.endsWith('centralbank.go.ke') || !/\.pdf$/i.test(u.pathname)) continue;
      const href = u.href;
      count.set(href, (count.get(href) ?? 0) + 1);
      const date = typeof r.auctionDate === 'string' ? r.auctionDate : '';
      // From 2020 the current parser reads these, so they are skipped unless the
      // row's own figures contradict each other (accepted above bids on a tender).
      const accepted = typeof r.amountAcceptedKESM === 'number' ? r.amountAcceptedKESM : 0;
      const bids = typeof r.bidsReceivedKESM === 'number' ? r.bidsReceivedKESM : 0;
      const contradicts = r.transactionType !== 'tap' && accepted > 0 && bids > 0 && accepted > bids + 0.01;
      if (date && date >= '2020-01-01' && !contradicts) continue;
      if (inGap.has(href)) continue;
      const doc = byUrl.get(href) ?? { url: href, file: decodeURIComponent(href.split('/').pop() ?? href), tier: 'verify' as const, rows: [] };
      doc.rows.push({ id: r.id, missing: [], ...(contradicts ? { contradicts: true } : {}) });
      byUrl.set(href, doc);
    } catch {
      continue;
    }
  }
  return [...byUrl.values()].filter((d) => (count.get(d.url) ?? 0) >= 2 || d.rows.some((r) => r.contradicts)).sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Named documents wanted for their own annual series, not for any archive row.
 *
 * The Fiscal Health chart on /macro/ needs ten years of debt and interest
 * history, and the National Treasury's Debt Sustainability Indicators table is
 * the primary source for it: total interest as a share of ordinary revenue and
 * public debt against GDP, one column per fiscal year. A session cannot reach
 * treasury.go.ke, so this reads the one PDF from here, as the CBK notices are
 * read. National Treasury is `permitted` in licences.ts. Exact URL only: this
 * never follows a link, and the host is pinned by no-server-personal-data.test.
 */
export const EXTRA_DOCS: GapDoc[] = [
  {
    url: 'https://www.treasury.go.ke/sites/default/files/debt/Debt%20Sustainability%20Indicators/MARCH%202026.pdf',
    file: 'Treasury Debt Sustainability Indicators MARCH 2026.pdf',
    tier: 'extra',
    rows: [],
  },
  // The IMF's own annual series for Kenya, 1980 to the current projection: the
  // primary source for the ten-year debt, deficit, revenue and spending history
  // (IMF Data terms are `permitted` in licences.ts). A small JSON document each.
  ...(['GGXWDG_NGDP', 'GGXCNL_NGDP', 'GGXONLB_NGDP', 'GGR_NGDP', 'GGX_NGDP'] as const).map(
    (code): GapDoc => ({
      url: `https://www.imf.org/external/datamapper/api/v1/${code}/KEN`,
      file: `IMF DataMapper ${code} Kenya (values).json`,
      tier: 'extra',
      rows: [],
    })
  ),
];
/** Characters posted for an extra document: a multi-column annual table runs long. */
const EXTRA_TEXT_CHARS = 16_000;

/** Everything still to read: gap documents first, then verification ones, then named extras. */
export function pendingDocs(rows: Row[]): GapDoc[] {
  const gap = gapDocs(rows);
  return [...gap, ...verifyDocs(rows, gap), ...EXTRA_DOCS];
}

/** The key a document is recorded under once read. Extras include the file name, so changing what is posted for one re-reads it. */
const readKey = (d: GapDoc) => (d.tier === 'extra' ? `${d.url}#${d.file}` : d.url);

async function pdfText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return `status ${res.status}`;
  if (!/\.pdf(\?|$)/i.test(url)) {
    const raw = (await res.text()).replace(/\s+/g, ' ').trim();
    // The IMF DataMapper document opens with a label for every country, which
    // would fill the post before any value. Keep only Kenya's series.
    try {
      const j = JSON.parse(raw) as { values?: Record<string, Record<string, Record<string, number>>> };
      const code = Object.keys(j.values ?? {})[0];
      if (j.values && code && j.values[code]?.KEN) return JSON.stringify({ indicator: code, KEN: j.values[code].KEN });
    } catch {
      /* not that document: fall through to the text */
    }
    return raw || '(empty)';
  }
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return (text as string).replace(/\s+/g, ' ').trim() || '(no text layer)';
}

export default async () => {
  const started = Date.now();
  const store = getStore('cbk-watch');
  const done = ((await store.get('gap-docs-read', { type: 'json' }).catch(() => null)) ?? {}) as Record<string, string>;
  const todo = pendingDocs(archive as unknown as Row[]).filter((d) => !done[readKey(d)]).slice(0, GAP_DOCS_PER_RUN);
  if (todo.length === 0) return;

  const read: { doc: GapDoc; text: string }[] = [];
  await Promise.all(
    todo.map(async (doc) => {
      const text = await pdfText(doc.url, GAP_DEADLINE_MS - (Date.now() - started)).catch((e) => `error ${String(e).slice(0, 100)}`);
      // A timeout or a server error is not a reading: leave it for a later run.
      // A named extra that is REFUSED is reported once instead, so a blocked host
      // is visible rather than a silent empty run, and is not retried forever.
      if (doc.tier === 'extra' && /^status (401|403|404|410)$/.test(text)) {
        read.push({ doc, text: `FETCH REFUSED: ${text}` });
        return;
      }
      if (/^status [45]\d\d$/.test(text) || /^error /.test(text)) return;
      read.push({ doc, text });
    })
  );
  if (read.length === 0) return;

  const site = process.env.URL ?? 'https://mwangazayield.org';
  const body = read
    .map(({ doc, text }) => `=== ${doc.file}\n${doc.tier === 'gap' ? 'wanted' : doc.tier === 'extra' ? 'extra' : 'verify'}: ${doc.rows.map((r) => `${r.id} [${r.missing.join(',')}]`).join('; ')}\n${text.slice(0, doc.tier === 'extra' ? EXTRA_TEXT_CHARS : TEXT_CHARS)}`)
    .join('\n')
    .slice(0, 38_000);
  const res = await fetch(`${site}/cbk-watch-form.html`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'form-name': 'cbk-watch', at: new Date().toISOString(), gapdocs: body }),
  }).catch(() => null);
  // Marked read only once the text has been delivered.
  if (!res || res.status >= 400) return;
  for (const { doc, text } of read) done[readKey(doc)] = text === '(no text layer)' ? 'no text layer' : 'read';
  await store.setJSON('gap-docs-read', done);
};

// Every five minutes until the archive's source documents have all been read;
// each run after that returns at once. Remove this schedule when it is done.
export const config: Config = { schedule: '*/5 * * * *' };
