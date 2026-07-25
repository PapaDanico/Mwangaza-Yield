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
  auctionDate: 'Auction date',
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

  const versions = new Set<number>();
  for (const r of records) {
    const v = (r as unknown as { parserVersion?: number }).parserVersion;
    if (typeof v === 'number') versions.add(v);
  }

  const complete = records.filter(isComplete).length;

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
    parserVersions: Array.from(versions).sort((a, b) => a - b),
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
    cols.join(','),
    ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(',')),
  ].join('\n');
}
