/**
 * How complete the auction archive actually is, field by field and year by year.
 *
 * WHY THIS EXISTS
 * ---------------
 * The archive is the one asset here nobody else has: auction results parsed out
 * of CBK's PDFs going back years, which exist publicly but have never been
 * machine-readable. The temptation with an asset like that is to describe it by
 * its headline — "350 records, 125 issues, 2014 to today" — all of which is
 * true and all of which overstates it. Measured against the six fields anyone
 * would actually want, far fewer records are complete.
 *
 * So this computes the real figure and the site publishes it. That is not
 * modesty, it is the strongest position available: we are the only source that
 * has this data at all, and the only one that will tell you exactly what is
 * missing from it. A buyer who can see the gaps can trust the rest. A buyer who
 * is told "complete historical coverage" and finds a hole has learned something
 * worse than a gap.
 *
 * It is also the work list. Every count below that is not the record total is a
 * parsing job someone can do, and the number moving is how we know it was done.
 */
import type { AuctionPrint } from '@/types/bond';

/** The fields that make a record worth something to a reader or a licensee.
 *  Ordered as they would appear in a row, not by how well they score. */
export const CORE_FIELDS = [
  'auctionDate',
  'couponRate',
  'pricePer100',
  'amountOfferedKESM',
  'amountAcceptedKESM',
  'bidsReceivedKESM',
] as const;

export type CoreField = (typeof CORE_FIELDS)[number];

export const FIELD_LABELS: Record<CoreField, string> = {
  // Called "value date" because that is what it is. CBK dates a results file
  // and its section-A heading from the Monday the bond is dated FROM, not the
  // day bidding closed: 297 of 303 dated records fall on a Monday, the six
  // exceptions are switch auctions and a buyback, and one tap-sale document
  // says so outright — "Settlement remains Monday 30th, June 2014" under a
  // filename reading "Dated 30.06.2014". Kenyan bonds auction on a Wednesday
  // and value the following Monday.
  //
  // The JSON key stays `auctionDate`, because renaming a published field breaks
  // anyone already reading it for the sake of a label. The label is where the
  // correction belongs.
  auctionDate: 'Value date',
  couponRate: 'Coupon rate',
  pricePer100: 'Price per 100',
  amountOfferedKESM: 'Amount offered',
  amountAcceptedKESM: 'Amount accepted',
  bidsReceivedKESM: 'Bids received',
};

export interface FieldCoverage {
  field: CoreField;
  label: string;
  present: number;
  total: number;
  pct: number;
}

export interface YearCoverage {
  year: string;
  records: number;
  complete: number;
}

export interface ArchiveQuality {
  records: number;
  issueCodes: number;
  /** Records carrying all six core fields. The number that matters. */
  complete: number;
  completePct: number;
  /** Records from which a bid-to-cover ratio can be computed. */
  bidToCover: number;
  earliest: string | null;
  latest: string | null;
  fields: FieldCoverage[];
  byYear: YearCoverage[];
  /** Parser versions present. More than one means a refresh is half-done and
   *  some rows were produced by a parser we have since fixed. */
  parserVersions: number[];
  /** How many rows each parser version produced, oldest version first.
   *
   *  The bare list says a rebuild is under way; this says how much of one is
   *  left, which is the difference between a caveat and a measurement. A reader
   *  looking at a field sitting at 60% deserves to know whether that is what the
   *  parser can do or what it has done so far. */
  byParserVersion: { version: number; records: number }[];
  /** Rows still awaiting the newest parser. Zero when the archive is uniform —
   *  including when no row carries a version at all, which is not a rebuild. */
  stale: number;
  /** Rows the NEWEST parser has read, and how many of those are complete.
   *
   *  Mid-rebuild these two numbers are the honest answer to "how good is this
   *  data", and the archive-wide percentage is not. A field sitting at 86%
   *  across the whole file while every row the current parser has touched
   *  carries it says something quite specific: the gap is unfinished work, not
   *  unreadable documents. Reporting only the lower number would understate the
   *  dataset; reporting only the higher one would overstate it. Both, labelled,
   *  is the only version that is true. */
  atNewest: { records: number; complete: number; pct: number } | null;
  /** Evidence for the claim that `auctionDate` holds the VALUE date.
   *
   *  The key is named for the auction, but CBK dates a bond from the following
   *  Monday, not the Wednesday bidding closed. The way to show that rather than
   *  assert it is to count: if the field held bidding dates it would pile up on
   *  Wednesdays, and it does not.
   *
   *  Computed rather than written down because the prose version was written
   *  down once and went stale — it claimed 297 Mondays out of 391 records long
   *  after the real figures were 372 out of 378, and used the whole-archive
   *  count as a denominator when 13 rows carry no date at all. A published
   *  number beside a computed one will always drift; this makes drift
   *  impossible. `exceptions` is a count, not a name, because the exceptions
   *  are not all one thing — five switch auctions and one buyback today. */
  valueDates: { dated: number; mondays: number; exceptions: number };
}

/** A field counts as present only if it carries information. Zero is treated as
 *  absent deliberately: every one of these is an amount, a rate or a price, and
 *  a genuine zero does not occur in a Kenyan bond auction. A row reading zero is
 *  a row the parser could not read. */
function present(record: AuctionPrint, field: CoreField): boolean {
  const v = (record as unknown as Record<string, unknown>)[field];
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'number') return v !== 0 && Number.isFinite(v);
  return true;
}

export function isComplete(record: AuctionPrint): boolean {
  return CORE_FIELDS.every((f) => present(record, f));
}

export function assessArchive(records: AuctionPrint[]): ArchiveQuality {
  const total = records.length;
  const dated = records.filter((r) => present(r, 'auctionDate')).map((r) => r.auctionDate);

  const byYearMap = new Map<string, { records: number; complete: number }>();
  for (const r of records) {
    if (!present(r, 'auctionDate')) continue;
    const y = r.auctionDate.slice(0, 4);
    const row = byYearMap.get(y) ?? { records: 0, complete: 0 };
    row.records += 1;
    if (isComplete(r)) row.complete += 1;
    byYearMap.set(y, row);
  }

  const versionCounts = new Map<number, number>();
  for (const r of records) {
    const v = (r as unknown as { parserVersion?: number }).parserVersion;
    if (typeof v === 'number') versionCounts.set(v, (versionCounts.get(v) ?? 0) + 1);
  }
  const byParserVersion = Array.from(versionCounts.entries())
    .map(([version, n]) => ({ version, records: n }))
    .sort((a, b) => a.version - b.version);
  // Everything below the newest version is stale. Rows with no version at all
  // are not counted: they predate stamping and no refresh is pending on them.
  const newest = byParserVersion.length ? byParserVersion[byParserVersion.length - 1].version : null;
  const stale = byParserVersion
    .filter((v) => newest !== null && v.version < newest)
    .reduce((s, v) => s + v.records, 0);

  const newestRows = records.filter(
    (r) => (r as unknown as { parserVersion?: number }).parserVersion === newest
  );
  const atNewest =
    newest === null || !newestRows.length
      ? null
      : {
          records: newestRows.length,
          complete: newestRows.filter(isComplete).length,
          pct: Math.round((newestRows.filter(isComplete).length / newestRows.length) * 100),
        };

  const complete = records.filter(isComplete).length;

  // getUTCDay, not getDay. A bare "YYYY-MM-DD" is parsed as UTC midnight, so in
  // any negative-offset timezone getDay() reads the previous day and every
  // Monday in the archive would report as a Sunday. The build runs in UTC and
  // the check would have passed there while being wrong for a reader in Nairobi
  // — the kind of bug that only ever appears in someone else's browser.
  const mondays = dated.filter((d) => new Date(d).getUTCDay() === 1).length;

  return {
    records: total,
    issueCodes: new Set(records.map((r) => r.issueCode)).size,
    complete,
    completePct: total ? Math.round((complete / total) * 100) : 0,
    bidToCover: records.filter(
      (r) => present(r, 'bidsReceivedKESM') && present(r, 'amountOfferedKESM')
    ).length,
    earliest: dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : null,
    latest: dated.length ? dated.reduce((a, b) => (a > b ? a : b)) : null,
    fields: CORE_FIELDS.map((field) => {
      const n = records.filter((r) => present(r, field)).length;
      return {
        field,
        label: FIELD_LABELS[field],
        present: n,
        total,
        pct: total ? Math.round((n / total) * 100) : 0,
      };
    }),
    byYear: Array.from(byYearMap.entries())
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    parserVersions: byParserVersion.map((v) => v.version),
    byParserVersion,
    stale,
    atNewest,
    valueDates: { dated: dated.length, mondays, exceptions: dated.length - mondays },
  };
}

/**
 * The archive as CSV, newest first — the form a licensee or a researcher would
 * actually want, and the form that makes the gaps visible rather than hidden
 * behind a JSON key that is simply absent.
 *
 * Empty stays empty. Writing 0 into a field we could not read would turn a
 * known gap into a false figure, which is the one failure mode that would make
 * this dataset worse than nothing.
 */
export function archiveToCSV(records: AuctionPrint[]): string {
  // `auctionDate` is exported under its true name. A CSV is the form a licensee
  // loads without reading a word of documentation, so a column header that says
  // "auction date" while holding the value date is the one place the misnomer
  // would do real damage. The JSON key is unchanged — see FIELD_LABELS.
  const HEADERS: Record<string, string> = { auctionDate: 'valueDate' };
  const cols = [
    'issueCode',
    'auctionDate',
    'couponRate',
    'pricePer100',
    'amountOfferedKESM',
    'amountAcceptedKESM',
    'bidsReceivedKESM',
    'sourceUrl',
  ] as const;

  const esc = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = [...records].sort((a, b) => (b.auctionDate ?? '').localeCompare(a.auctionDate ?? ''));
  return [
    cols.map((c) => HEADERS[c] ?? c).join(','),
    ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(',')),
  ].join('\n');
}
