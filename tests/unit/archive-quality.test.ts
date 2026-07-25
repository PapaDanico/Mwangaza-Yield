import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import {
  CORE_FIELDS,
  archiveToCSV,
  assessArchive,
  isComplete,
} from '../../src/lib/archive-quality';
import type { AuctionPrint } from '../../src/types/bond';

const rec = (over: Partial<AuctionPrint> = {}): AuctionPrint => ({
  id: 'r1',
  issueCode: 'FXD1/2024/10',
  auctionDate: '2024-06-17',
  couponRate: 16,
  pricePer100: 99.5,
  amountOfferedKESM: 30_000,
  amountAcceptedKESM: 28_000,
  bidsReceivedKESM: 45_000,
  sourceUrl: 'https://example.invalid/a.pdf',
  ...over,
});

describe('what counts as present', () => {
  it('accepts a fully parsed record', () => {
    expect(isComplete(rec())).toBe(true);
  });

  it.each(CORE_FIELDS)('treats a missing %s as incomplete', (field) => {
    expect(isComplete(rec({ [field]: undefined }))).toBe(false);
  });

  it('treats zero as unread, not as a real figure', () => {
    // No Kenyan bond auction offers zero, accepts zero, or prices at zero. A
    // row reading 0 is a row the parser failed on, and counting it as data
    // would inflate every coverage number on the page.
    expect(isComplete(rec({ amountAcceptedKESM: 0 }))).toBe(false);
    expect(isComplete(rec({ pricePer100: 0 }))).toBe(false);
  });

  it('treats an empty auction date as missing', () => {
    expect(isComplete(rec({ auctionDate: '' }))).toBe(false);
  });
});

describe('assessArchive', () => {
  const sample = [
    rec({ id: 'a', auctionDate: '2024-01-08' }),
    rec({ id: 'b', auctionDate: '2024-06-17', bidsReceivedKESM: undefined }),
    rec({ id: 'c', auctionDate: '2025-03-10', issueCode: 'IFB1/2025/09' }),
    rec({ id: 'd', auctionDate: '', couponRate: undefined }),
  ];

  it('counts records, issues and completeness', () => {
    const q = assessArchive(sample);
    expect(q.records).toBe(4);
    expect(q.issueCodes).toBe(2);
    expect(q.complete).toBe(2);
    expect(q.completePct).toBe(50);
  });

  it('reports the date range from dated records only', () => {
    const q = assessArchive(sample);
    expect(q.earliest).toBe('2024-01-08');
    expect(q.latest).toBe('2025-03-10');
  });

  it('counts bid-to-cover separately, since it needs two fields', () => {
    const q = assessArchive(sample);
    // 'b' has no bids received, so three of four qualify.
    expect(q.bidToCover).toBe(3);
  });

  it('groups by year and excludes undated records from the year table', () => {
    const q = assessArchive(sample);
    expect(q.byYear).toEqual([
      { year: '2024', records: 2, complete: 1 },
      { year: '2025', records: 1, complete: 1 },
    ]);
  });

  it('surfaces every parser version present', () => {
    const mixed = [
      { ...rec({ id: 'x' }), parserVersion: 4 },
      { ...rec({ id: 'y' }), parserVersion: 5 },
    ] as unknown as AuctionPrint[];
    // More than one version means a refresh is half-done — some rows came from
    // a parser we have since fixed, and the page should be able to say so.
    expect(assessArchive(mixed).parserVersions).toEqual([4, 5]);
  });

  it('counts how many rows each parser version produced', () => {
    const mixed = [
      { ...rec({ id: 'x' }), parserVersion: 5 },
      { ...rec({ id: 'y' }), parserVersion: 6 },
      { ...rec({ id: 'z' }), parserVersion: 6 },
    ] as unknown as AuctionPrint[];
    const q = assessArchive(mixed);
    expect(q.byParserVersion).toEqual([
      { version: 5, records: 1 },
      { version: 6, records: 2 },
    ]);
    // One row is behind the newest parser and will gain fields when re-read.
    expect(q.stale).toBe(1);
  });

  it('reports how the NEWEST parser is doing, separately from the archive', () => {
    // Mid-rebuild the archive-wide figure describes a half-finished job, not the
    // parser. Both numbers are needed: one alone understates the dataset, the
    // other alone overstates it.
    const mixed = [
      { ...rec({ id: 'a' }), parserVersion: 8, amountAcceptedKESM: undefined },
      { ...rec({ id: 'b' }), parserVersion: 9 },
      { ...rec({ id: 'c' }), parserVersion: 9 },
      { ...rec({ id: 'd' }), parserVersion: 9, bidsReceivedKESM: undefined },
    ] as unknown as AuctionPrint[];
    const q = assessArchive(mixed);
    expect(q.completePct).toBe(50); // two of four, archive-wide
    expect(q.atNewest).toEqual({ records: 3, complete: 2, pct: 67 });
  });

  it('has no newest-parser figure when nothing carries a version', () => {
    // Rows predating version stamping are not a rebuild, so there is no
    // "current parser" subset to report and claiming one would be invention.
    expect(assessArchive(sample).atNewest).toBeNull();
    expect(assessArchive([]).atNewest).toBeNull();
  });

  it('reports nothing stale when every row came from the same parser', () => {
    const uniform = [
      { ...rec({ id: 'x' }), parserVersion: 6 },
      { ...rec({ id: 'y' }), parserVersion: 6 },
    ] as unknown as AuctionPrint[];
    expect(assessArchive(uniform).stale).toBe(0);
  });

  it('does not call unstamped rows stale — they are not awaiting anything', () => {
    // Rows predating version stamping have no pending re-read. Counting them
    // would put a permanent "rebuild in progress" banner on the page.
    const q = assessArchive(sample);
    expect(q.stale).toBe(0);
    expect(q.byParserVersion).toEqual([]);
  });

  it('survives an empty archive without dividing by zero', () => {
    const q = assessArchive([]);
    expect(q.completePct).toBe(0);
    expect(q.earliest).toBeNull();
    expect(q.fields.every((f) => f.pct === 0)).toBe(true);
  });
});

describe('archiveToCSV', () => {
  it('writes a header and one row per record, newest first', () => {
    const csv = archiveToCSV([
      rec({ id: 'old', auctionDate: '2020-01-06' }),
      rec({ id: 'new', auctionDate: '2026-01-05' }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0].startsWith('issueCode,valueDate')).toBe(true);
    expect(lines[1]).toContain('2026-01-05');
    expect(lines[2]).toContain('2020-01-06');
  });

  it('names the date column what it actually holds', () => {
    // The JSON key is `auctionDate` and stays that way, because renaming a
    // published field breaks anyone already reading it. But the value is the
    // date CBK dates the bond FROM — the Monday — not the Wednesday bidding
    // closed: 297 of 303 dated records land on a Monday, and one tap-sale
    // document says outright that its filename date is the settlement date.
    //
    // A CSV is the form a licensee opens without reading any documentation, so
    // it is the one place the misnomer would do real damage.
    const header = archiveToCSV([rec({})]).split('\n')[0];
    expect(header).toContain('valueDate');
    expect(header).not.toContain('auctionDate');
  });

  it('leaves a gap empty rather than writing a zero into it', () => {
    // The single most damaging thing this file could do is turn "we could not
    // read this" into "this was zero".
    const csv = archiveToCSV([rec({ amountAcceptedKESM: undefined })]);
    const cells = csv.split('\n')[1].split(',');
    expect(cells[5]).toBe('');
    expect(csv).not.toContain(',0,');
  });

  it('quotes a value containing a comma', () => {
    const csv = archiveToCSV([rec({ issueCode: 'FXD1/2024/10, reopened' })]);
    expect(csv).toContain('"FXD1/2024/10, reopened"');
  });

  it('handles an archive with no records', () => {
    expect(archiveToCSV([]).split('\n')).toHaveLength(1);
  });
});

describe('the real archive, measured rather than described', () => {
  const q = assessArchive(archive as unknown as AuctionPrint[]);

  it('has records to assess', () => {
    // Not pinned to a snapshot: the parser legitimately drops records it can no
    // longer attribute, and version 5 cut the archive from 350 to 130 doing
    // exactly that. A threshold tied to the old count would report an
    // improvement as a failure.
    expect(q.records).toBeGreaterThan(50);
  });

  it('never reports more complete records than records', () => {
    expect(q.complete).toBeLessThanOrEqual(q.records);
    expect(q.byYear.every((y) => y.complete <= y.records)).toBe(true);
  });

  it('accounts for every dated record in the year table', () => {
    const dated = (archive as unknown as AuctionPrint[]).filter((r) => r.auctionDate).length;
    expect(q.byYear.reduce((s, y) => s + y.records, 0)).toBe(dated);
  });

  it('produces a CSV with one line per record plus a header', () => {
    const csv = archiveToCSV(archive as unknown as AuctionPrint[]);
    expect(csv.split('\n')).toHaveLength(q.records + 1);
  });

  describe('valueDates — the evidence that auctionDate is the value date', () => {
    it('counts only records that carry a date', () => {
      // The published sentence used the whole-archive count as its denominator
      // while counting Mondays among the dated rows only, which quietly
      // understated the proportion. Undated rows are not evidence either way.
      const dated = (archive as unknown as AuctionPrint[]).filter((r) => r.auctionDate).length;
      expect(q.valueDates.dated).toBe(dated);
      expect(q.valueDates.mondays + q.valueDates.exceptions).toBe(q.valueDates.dated);
    });

    it('finds the overwhelming majority on a Monday', () => {
      // The claim this footnote makes, asserted as a proportion rather than a
      // fixed count so that it survives the archive growing. If this ever drops
      // below nine in ten, the field is not holding what the note says it holds
      // and the note is the thing to change.
      expect(q.valueDates.mondays / q.valueDates.dated).toBeGreaterThan(0.9);
    });

    it('reads a Monday as a Monday west of Greenwich', () => {
      // A bare YYYY-MM-DD parses as UTC midnight, so getDay() in any negative
      // offset reads the day before and every Monday reports as a Sunday. CI
      // runs in UTC, where the bug is invisible; a reader in New York would see
      // the archive claim almost no Mondays at all. Pinned by forcing the
      // offset rather than by trusting the reviewer to remember.
      const tz = process.env.TZ;
      try {
        process.env.TZ = 'America/New_York';
        const q2 = assessArchive([rec({ auctionDate: '2024-06-17' })]);
        expect(q2.valueDates.mondays).toBe(1);
      } finally {
        process.env.TZ = tz;
      }
    });
  });
});
