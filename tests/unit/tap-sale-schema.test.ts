import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assessArchive,
  isComplete,
  applicableFields,
  CORE_FIELDS,
  TAP_SALE_FIELDS,
} from '../../src/lib/archive-quality';
import { auctionKind } from '../../src/lib/auction-history';
import type { AuctionPrint } from '../../src/types/bond';

/**
 * "No tap sale has ever parsed completely" was true and meant nothing.
 *
 * A tap sale is first-come-first-served against a quantum, not a competitive
 * auction against an offer. Its results document reports bids accepted at face
 * and at cost, the number of accepted bids, the allocated average rate, the
 * adjusted average price and the coupon — and that is the whole document.
 * There is no amount offered and no market weighted average, because neither
 * exists for the instrument.
 *
 * The completeness check scored them against the competitive schema anyway, so
 * it measured 68 documents against fields their source can never contain. The
 * archive reported a permanent deficit it had no way to close, and anyone
 * tuning the parser against that number would have been chasing documents that
 * were already complete.
 *
 * docs/ARCHIVE-GAPS.md measured this and predicted that fixing what is COUNTED
 * would move the figure further than fixing what is parsed. Against the live
 * archive it moves complete records from 336 to 347 of 387 — and, more to the
 * point, makes the remainder a list of real defects rather than a mixture of
 * defects and category errors.
 */
const ARCHIVE: AuctionPrint[] = JSON.parse(
  readFileSync(new URL('../../public/data/auction-results.json', import.meta.url), 'utf8')
);

describe('tap sales are scored against their own document type', () => {
  const taps = ARCHIVE.filter((r) => auctionKind(r) === 'tap');

  it('the archive actually contains tap sales, or this proves nothing', () => {
    // A schema fix verified against zero matching records is a fix verified
    // against nothing.
    expect(taps.length).toBeGreaterThan(20);
    expect(ARCHIVE.length).toBeGreaterThan(300);
  });

  it('does not require fields a tap-sale document cannot state', () => {
    for (const f of ['amountOfferedKESM', 'bidsReceivedKESM'] as const) {
      expect(TAP_SALE_FIELDS, `tap sales are still scored on ${f}`).not.toContain(f);
      expect(CORE_FIELDS, `${f} should still be required of competitive auctions`).toContain(f);
    }
  });

  it('still requires everything a tap sale DOES report', () => {
    /* The risk of a narrower schema is that it excuses genuine parser
     * failures. A tap sale states its coupon, its price and what it accepted;
     * missing any of those is a real defect and must still count as one. */
    for (const f of ['auctionDate', 'couponRate', 'pricePer100', 'amountAcceptedKESM'] as const) {
      expect(TAP_SALE_FIELDS).toContain(f);
    }
    const gutted = { ...taps[0], couponRate: undefined } as AuctionPrint;
    expect(isComplete(gutted), 'a tap sale missing its coupon is being passed as complete').toBe(
      false
    );
  });

  it('leaves competitive auctions judged exactly as before', () => {
    // The fix must not quietly relax the standard for the other 319 records.
    for (const r of ARCHIVE.filter((x) => auctionKind(x) !== 'tap')) {
      expect(applicableFields(r)).toEqual(CORE_FIELDS);
    }
  });

  it('moves the measured archive, and by the amount claimed', () => {
    /* Asserted as a number rather than "greater than before", because a
     * measurement quoted in a document and a measurement produced by the code
     * are exactly the pair this project keeps finding drifted apart. If this
     * fails, ARCHIVE-GAPS.md and the commit message are both out of date. */
    const q = assessArchive(ARCHIVE);
    expect(q.records).toBe(387);
    expect(q.complete).toBe(347);
    expect(q.completePct).toBe(90);
  });

  it('never counts a tap sale as usable for a cover ratio', () => {
    /* Structural, not a data gap: a tap sale has no offer to be covered, so no
     * amount of parser work will ever produce a ratio for one. It fell out of
     * this count already because it carries neither field — right by accident,
     * which is not the same as right. */
    const q = assessArchive(ARCHIVE);
    const withBoth = ARCHIVE.filter(
      (r) => auctionKind(r) !== 'tap' && r.bidsReceivedKESM && r.amountOfferedKESM
    ).length;
    expect(q.bidToCover).toBe(withBoth);

    const fabricated = {
      ...taps[0],
      amountOfferedKESM: 10_000,
      bidsReceivedKESM: 12_000,
    } as AuctionPrint;
    const withFake = assessArchive([...ARCHIVE, fabricated]);
    expect(
      withFake.bidToCover,
      'a tap sale carrying an offered figure was admitted to the cover count'
    ).toBe(q.bidToCover);
  });

  it('scores each field against the records that could carry it', () => {
    // Counting a tap sale as missing "amount offered" drags the field down
    // with documents that were never going to state it, and a reader cannot
    // tell that from a parser failure.
    const q = assessArchive(ARCHIVE);
    const offered = q.fields.find((f) => f.field === 'amountOfferedKESM')!;
    expect(offered.total).toBe(ARCHIVE.length - taps.length);
    const dated = q.fields.find((f) => f.field === 'auctionDate')!;
    expect(dated.total).toBe(ARCHIVE.length);
  });
});
