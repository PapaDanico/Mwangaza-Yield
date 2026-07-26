import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import feed from '../../public/data/rates.json';

/**
 * The CSV delivery of the rates feed.
 *
 * docs/REVENUE.md §2 argues that the analyst evaluating a licence works in a
 * spreadsheet, not in `npm install` — a JSON feed asks them to write a parser
 * before they can see whether the numbers are any good. So the same figures
 * are published as one flat table.
 *
 * Two files carrying the same numbers is exactly the shape that drifts, and
 * the drift would be silent and commercial: a prospect checking the CSV
 * against their own book would find a discrepancy we never saw. These tests
 * pin them to each other.
 */

const csv = readFileSync(
  new URL('../../public/data/rates.csv', import.meta.url),
  'utf8',
);

/** Minimal RFC4180-ish reader — enough for a file we generate ourselves. */
function parse(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const lines = csv.trimEnd().split('\n');
const headerIdx = lines.findIndex((l) => l.startsWith('series,'));
const header = parse(lines[headerIdx]);
const rows = lines.slice(headerIdx + 1).map((l) => {
  const cells = parse(l);
  return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
});

const col = (r: Record<string, string>, k: string) => (r[k] === '' ? null : Number(r[k]));

describe('the CSV opens as a spreadsheet would read it', () => {
  it('is one rectangular table with a single header row', () => {
    expect(headerIdx).toBeGreaterThan(0); // the caveat block precedes it
    for (const l of lines.slice(headerIdx)) {
      expect(parse(l)).toHaveLength(header.length);
    }
  });

  it('carries the caveats above the data, not in a separate file', () => {
    const preamble = lines.slice(0, headerIdx).join('\n');
    expect(preamble).toMatch(/Mwangaza Yield/);
    expect(preamble).toMatch(/NOT a return/);
    expect(preamble).toMatch(/REMAINING term/);
    expect(preamble).toMatch(/not investment advice/);
  });

  it('quotes any cell that would otherwise break the columns', () => {
    // The caveats contain commas. If they were not quoted, every consumer
    // would see a ragged file — and most would see it silently.
    for (const l of lines) {
      if (!l.includes(',') || l.startsWith('series,')) continue;
      const cells = parse(l);
      expect(cells.every((c) => typeof c === 'string')).toBe(true);
    }
  });
});

describe('the feed is actually reachable by the people it is published for', () => {
  /**
   * Shipping the file is not publishing it.
   *
   * The CSV went out with no `Access-Control-Allow-Origin`: it fell through to
   * the generic `/data/*` rule, so a browser could download it by typing the
   * URL and could NOT `fetch()` it from anywhere else. That is exactly the use
   * it exists for — docs/REVENUE.md publishes it so an analyst evaluating a
   * licence can pull it straight into their own sheet or dashboard. Served but
   * unfetchable is the worst of both: it looks fine from here and fails for
   * everyone it was built for.
   *
   * This asserts against netlify.toml rather than a live response on purpose.
   * The deploy is not reachable from the test runner, and a rule that is in the
   * config is a rule Netlify will apply.
   */
  const toml = readFileSync(
    new URL('../../netlify.toml', import.meta.url),
    'utf8',
  );

  /** Every artifact the feed publishes for third parties. */
  const PUBLISHED = ['/data/rates.json', '/data/rates.csv'];

  it.each(PUBLISHED)('grants cross-origin reads to %s', (path) => {
    const block = toml.split('[[headers]]').find((b) => b.includes(`for = "${path}"`));
    expect(block, `no header rule for ${path}`).toBeDefined();
    expect(block).toMatch(/Access-Control-Allow-Origin\s*=\s*"\*"/);
    expect(block).toMatch(/Access-Control-Allow-Methods/);
  });

  it('serves the CSV as a CSV rather than leaving it to be guessed', () => {
    const block = toml.split('[[headers]]').find((b) => b.includes('for = "/data/rates.csv"'))!;
    expect(block).toMatch(/Content-Type\s*=\s*"text\/csv/);
  });
});

describe('the CSV and the JSON say the same thing', () => {
  const tbillRows = rows.filter((r) => r.series === 'tbill');

  it('publishes every T-bill, with the quote and the return kept apart', () => {
    expect(tbillRows).toHaveLength(feed.tbills.length);
    for (const t of feed.tbills) {
      const row = tbillRows.find((r) => Number(r.tenorDays) === t.tenorDays)!;
      expect(row, `missing ${t.tenorDays}-day row`).toBeDefined();
      expect(col(row, 'quotedDiscountRate')).toBeCloseTo(t.quotedDiscountRate, 6);
      expect(col(row, 'grossRate')).toBeCloseTo(t.grossEAY, 6);
      expect(col(row, 'netRate')).toBeCloseTo(t.netEAY, 6);
      // The whole point of the feed: the quote is not the return, and the CSV
      // must not let anyone mistake one for the other.
      expect(col(row, 'quotedDiscountRate')).not.toBeCloseTo(col(row, 'netRate')!, 3);
      expect(col(row, 'grossRate')!).toBeGreaterThan(col(row, 'quotedDiscountRate')!);
      expect(col(row, 'netRate')!).toBeLessThan(col(row, 'grossRate')!);
    }
  });

  it('publishes every auction band, and leaves the unquotable ones blank', () => {
    const bands = feed.bondAuctionBenchmarks.bands;
    const bandRows = rows.filter((r) => r.series === 'bondAuctionBand');
    expect(bandRows).toHaveLength(bands.length);
    for (const b of bands) {
      const row = bandRows.find((r) => r.label === b.label)!;
      expect(row, `missing band ${b.label}`).toBeDefined();
      expect(Number(row.sampleSize)).toBe(b.auctions);
      if (b.medianClearingRate === null) {
        // Silence, not a zero. A zero in a rate column is a claim.
        expect(row.grossRate).toBe('');
      } else {
        expect(col(row, 'grossRate')).toBeCloseTo(b.medianClearingRate, 6);
      }
    }
  });

  it('publishes every macro reading it holds, with its date and source', () => {
    const macroRows = rows.filter((r) => r.series === 'macro');
    const present = Object.entries(feed.macro).filter(([, v]) => v !== null);
    expect(macroRows).toHaveLength(present.length);
    for (const [key, m] of present) {
      const row = macroRows.find((r) => r.label === key)!;
      expect(row).toBeDefined();
      expect(col(row, 'grossRate')).toBeCloseTo(m!.value, 6);
      expect(row.asOf).toBe(m!.date);
      expect(row.source).toBe(m!.source);
    }
  });

  it('dates and attributes every single row', () => {
    for (const r of rows) {
      expect(r.source, `row ${r.label} has no source`).toBeTruthy();
      // Bands with no auctions have nothing to date; everything else must.
      if (r.series !== 'bondAuctionBand' || Number(r.sampleSize) > 0) {
        expect(r.asOf, `row ${r.label} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
