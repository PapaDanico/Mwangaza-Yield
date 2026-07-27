import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import {
  parseDhowCsd,
  parseDhowDate,
  toHoldings,
  looksLikeDhowCsd,
} from '../../src/lib/dhowcsd';

/**
 * A DhowCSD export, structurally identical to a real one.
 *
 * The shape is taken from an actual export — the misspelt "Avaliable Quantity"
 * heading is DhowCSD's, not a typo here, and the trailer block with its
 * multi-line quoted IBAN field is exactly how the file arrives. The personal
 * details are invented. A real export carries a full name, email, postal
 * address, phone number, KRA PIN, CUI and account numbers, and none of that
 * belongs in a repository.
 */
const HEADER =
  '﻿Issuer,Issue number,ISIN,Maturity date,Issue type,Account,Individual Nominal Value,' +
  'Avaliable Quantity,Pledge Quantity,Banned Quantity,Disputed Quantity,Total Quantity,Currency,' +
  'Exchange Rate,Available Value,Pledge Value,Banned Value,Face Value,Disputed Value,Total Value';

const TRAILER =
  '"Export date: 27 Jul 2026, 15:12:13",,,,,,,,,,,,,,,,,,,\n' +
  'Requested date: 27 Jul 2026,,,,,,,,,,,,,,,,,,,\n' +
  '"IBAN: 111111-0004 (Account Owner: A SAMPLE NAME),\n222222-0004 (Account Owner: A SAMPLE NAME)"' +
  ',,,,,,,,,,,,,,,,,,,\n' +
  'Email: sample@example.com,,,,,,,,,,,,,,,,,,,\n' +
  '"Address: KE, Somewhere, 00100",,,,,,,,,,,,,,,,,,,\n' +
  'Full Name: A SAMPLE NAME,,,,,,,,,,,,,,,,,,,\n' +
  'Cui: N00000000,,,,,,,,,,,,,,,,,,,\n' +
  'KRA PIN: A000000000X,,,,,,,,,,,,,,,,,,,\n';

const ONE_BOND =
  'GOVERNMENT OF KENYA,IFB1/2022/018,KE8000002322,21 May 2040,Treasury Bonds,,"50,000",' +
  '11,0,0,0,11,KES,,"550,000",0,0,"550,000",0,"550,000"';

function parse(body: string) {
  const res = Papa.parse<Record<string, string>>(`${HEADER}\n${body}`, {
    header: true,
    skipEmptyLines: true,
  });
  return parseDhowCsd(res.data);
}

describe('recognising the format', () => {
  it('identifies a DhowCSD export by its position columns', () => {
    const res = Papa.parse<Record<string, string>>(`${HEADER}\n${ONE_BOND}\n${TRAILER}`, {
      header: true,
      skipEmptyLines: true,
    });
    expect(looksLikeDhowCsd(res.data)).toBe(true);
  });

  it('does not mistake our own four-column template for one', () => {
    const res = Papa.parse<Record<string, string>>(
      'issueCode,faceValueKES,purchaseDate,purchaseCleanPrice\nFXD1/2022/10,1000000,2026-07-13,100',
      { header: true, skipEmptyLines: true }
    );
    expect(looksLikeDhowCsd(res.data)).toBe(false);
    // And returns nothing rather than half-reading it.
    expect(parseDhowCsd(res.data).positions).toEqual([]);
  });

  it('is not defeated by the byte order mark on the first heading', () => {
    // The export begins with a BOM, so the first key is "﻿Issuer". A
    // strict equality match on headers finds nothing and reports an empty
    // portfolio, which reads as "you own nothing" rather than as a failure.
    expect(parse(`${ONE_BOND}\n${TRAILER}`).recognised).toBe(true);
  });
});

describe('reading the positions', () => {
  const out = parse(`${ONE_BOND}\n${TRAILER}`);

  it('reads the holding', () => {
    expect(out.positions).toHaveLength(1);
    const p = out.positions[0];
    expect(p.issueCode).toBe('IFB1/2022/018');
    expect(p.isin).toBe('KE8000002322');
    expect(p.maturityDate).toBe('2040-05-21');
    expect(p.faceValueKES).toBe(550_000);
    expect(p.totalQuantity).toBe(11);
    expect(p.currency).toBe('KES');
  });

  it('strips the thousands separators rather than reading 50 as fifty', () => {
    // "50,000" through Number() is NaN; through a naive split on commas it is
    // 50. Both are wrong by three orders of magnitude on a face value.
    expect(out.positions[0].faceValueKES).toBe(550_000);
  });

  it('reads the misspelt availability column DhowCSD actually writes', () => {
    // The heading in the real export is "Avaliable Quantity". Matching only
    // the correct spelling silently reports every holding as fully encumbered.
    expect(out.positions[0].availableQuantity).toBe(11);
    expect(out.positions[0].encumberedQuantity).toBe(0);
  });

  it('counts pledged and banned units as encumbered', () => {
    const pledged =
      'GOVERNMENT OF KENYA,FXD1/2022/010,KE1000000001,15 Jan 2032,Treasury Bonds,,"100,000",' +
      '3,2,1,0,6,KES,,"300,000",0,0,"600,000",0,"600,000"';
    const p = parse(`${pledged}\n${TRAILER}`).positions[0];
    expect(p.totalQuantity).toBe(6);
    expect(p.availableQuantity).toBe(3);
    // Three units are pledged or banned — held, but not sellable. A reader
    // planning to sell needs this and it is nowhere in a face value.
    expect(p.encumberedQuantity).toBe(3);
  });
});

describe('the trailer, which is personal data', () => {
  /**
   * The export ends with the account holder's name, email, postal address,
   * phone number, KRA PIN, CUI and IBANs. Parsing must stop before it.
   */
  it('reads nothing from below the positions', () => {
    const out = parse(`${ONE_BOND}\n${TRAILER}`);
    const serialised = JSON.stringify(out);
    for (const secret of [
      'A SAMPLE NAME',
      'sample@example.com',
      'A000000000X',
      'N00000000',
      '111111-0004',
      'Somewhere',
    ]) {
      expect(serialised, `the trailer value "${secret}" survived parsing`).not.toContain(secret);
    }
  });

  it('does not report the trailer rows as broken holdings', () => {
    // Skipping them one by one instead of stopping would leave eight
    // "rejected" rows and a warning about a file that is perfectly fine.
    expect(parse(`${ONE_BOND}\n${TRAILER}`).rejected).toEqual([]);
  });
});

describe('refusing rather than guessing', () => {
  it('rejects a row whose stated face value contradicts quantity times nominal', () => {
    // One of the two readings is wrong and nothing says which. Halving the
    // difference would put a number in a portfolio that no document states.
    const contradictory =
      'GOVERNMENT OF KENYA,FXD1/2022/010,KE1,15 Jan 2032,Treasury Bonds,,"50,000",' +
      '11,0,0,0,11,KES,,"550,000",0,0,"900,000",0,"900,000"';
    const out = parse(`${contradictory}\n${TRAILER}`);
    expect(out.positions).toEqual([]);
    expect(out.rejected[0].reason).toMatch(/does not match/);
  });

  it('falls back to quantity times nominal when the face value column is blank', () => {
    const blank =
      'GOVERNMENT OF KENYA,FXD1/2022/010,KE1,15 Jan 2032,Treasury Bonds,,"50,000",' +
      '11,0,0,0,11,KES,,"550,000",0,0,,0,"550,000"';
    expect(parse(`${blank}\n${TRAILER}`).positions[0].faceValueKES).toBe(550_000);
  });

  it('returns a null maturity rather than an invented one', () => {
    const odd =
      'GOVERNMENT OF KENYA,FXD1/2022/010,KE1,not a date,Treasury Bonds,,"50,000",' +
      '11,0,0,0,11,KES,,"550,000",0,0,"550,000",0,"550,000"';
    expect(parse(`${odd}\n${TRAILER}`).positions[0].maturityDate).toBeNull();
  });

  it('parses the date format the export uses, and only that', () => {
    expect(parseDhowDate('21 May 2040')).toBe('2040-05-21');
    expect(parseDhowDate('1 Jan 2030')).toBe('2030-01-01');
    expect(parseDhowDate('21 September 2040')).toBe('2040-09-21');
    expect(parseDhowDate('2040-05-21')).toBeNull();
    expect(parseDhowDate('21 Foo 2040')).toBeNull();
    expect(parseDhowDate('')).toBeNull();
    expect(parseDhowDate(undefined)).toBeNull();
  });
});

describe('turning positions into holdings', () => {
  /**
   * The point of the whole module.
   *
   * A custody statement says what is held, never what was paid. The importer
   * this replaces defaults a missing price to 100 and a missing date to today,
   * which would give every imported holding a cost basis nobody supplied — and
   * the yield and return computed from it would be shown to a reader as facts
   * about their own money.
   */
  it('marks the cost basis as unknown, because the export does not carry one', () => {
    const [h] = toHoldings(parse(`${ONE_BOND}\n${TRAILER}`).positions);
    expect(h.costBasisKnown, 'an imported holding claimed a known cost basis').toBe(false);
    expect(h.purchaseDate, 'a purchase date was invented').toBe('');
  });

  it('carries the face value and identity through exactly', () => {
    const [h] = toHoldings(parse(`${ONE_BOND}\n${TRAILER}`).positions);
    expect(h.faceValueKES).toBe(550_000);
    expect(h.issueCode).toBe('IFB1/2022/018');
    expect(h.isin).toBe('KE8000002322');
  });

  it('gives each holding a distinct id so two positions cannot overwrite each other', () => {
    const two = `${ONE_BOND}\n${ONE_BOND}`;
    const ids = toHoldings(parse(`${two}\n${TRAILER}`).positions).map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });
});
