import { describe, it, expect } from 'vitest';
import { buildQuoteLink, readQuoteParams, shareableQuoteUrl } from '../../src/lib/quote-link';
import { MIN_PRICE, MAX_PRICE } from '../../src/lib/prices';

/**
 * /sell is the page most likely to be shown to a second person — an advisor, a
 * spouse, the broker who gave the quote — and it was the only one with no way
 * to do that. A link carries the whole quote so the other person opens the same
 * numbers and can change one.
 *
 * These tests care less about the happy round trip than about what happens when
 * the link has been edited, because a link is the most trivially editable input
 * this app takes.
 */

const FULL = {
  isin: 'KE1000001493',
  face: 400_000,
  dirty: 98.5,
  quotedYTM: 13.2,
  commission: 1_500,
  levies: 0,
  settlement: '2026-08-08',
};

describe('buildQuoteLink', () => {
  it('carries the whole quote', () => {
    const link = buildQuoteLink('/sell/', FULL);
    const params = new URLSearchParams(link.slice(link.indexOf('?')));
    expect(params.get('isin')).toBe('KE1000001493');
    expect(params.get('face')).toBe('400000');
    expect(params.get('dirty')).toBe('98.5');
    expect(params.get('settlement')).toBe('2026-08-08');
  });

  it('returns a bare path rather than a dangling "?" when nothing survives', () => {
    expect(buildQuoteLink('/sell/', {})).toBe('/sell/');
    expect(buildQuoteLink('/sell/', { dirty: NaN, face: Infinity })).toBe('/sell/');
  });

  /* A link is read by PEOPLE as well as machines. "dirty=NaN" in a WhatsApp
   * message costs more trust than the missing field does. */
  it('omits junk instead of serialising it', () => {
    const link = buildQuoteLink('/sell/', { ...FULL, dirty: NaN, face: Infinity });
    expect(link).not.toContain('NaN');
    expect(link).not.toContain('Infinity');
    expect(link).toContain('isin=KE1000001493');
  });
});

describe('readQuoteParams', () => {
  it('reads back what buildQuoteLink wrote', () => {
    const link = buildQuoteLink('/sell/', FULL);
    expect(readQuoteParams(link.slice(link.indexOf('?')))).toEqual(FULL);
  });

  /* THE PRICE BAND IS REUSED, NOT RESTATED. isPlausiblePrice already enforces
   * 40-160 for a price the reader RECORDS; a price arriving by link is held to
   * the same standard rather than a second, private one. */
  it('holds a shared price to the same band as a recorded one', () => {
    expect(readQuoteParams(`?dirty=${MIN_PRICE}`).dirty).toBe(MIN_PRICE);
    expect(readQuoteParams(`?dirty=${MAX_PRICE}`).dirty).toBe(MAX_PRICE);
    expect(readQuoteParams(`?dirty=${MIN_PRICE - 1}`).dirty).toBeUndefined();
    expect(readQuoteParams(`?dirty=${MAX_PRICE + 1}`).dirty).toBeUndefined();
    expect(readQuoteParams('?dirty=1e400').dirty).toBeUndefined();
  });

  it('refuses an ISIN that is not one', () => {
    expect(readQuoteParams('?isin=KE1000001493').isin).toBe('KE1000001493');
    for (const bad of ['', 'short', '<script>', 'KE100 0001493', 'ke1000001493']) {
      expect(readQuoteParams(`?isin=${encodeURIComponent(bad)}`).isin, bad).toBeUndefined();
    }
  });

  /* "2026-02-31" is not a day, and `new Date` will happily roll it into March.
   * A settlement date silently moved by a month reprices the whole quote. */
  it('refuses a date that is not a real day', () => {
    expect(readQuoteParams('?settlement=2026-08-08').settlement).toBe('2026-08-08');
    for (const bad of ['2026-02-31', '2026-13-01', '08-08-2026', 'today', '2026-8-8']) {
      expect(readQuoteParams(`?settlement=${bad}`).settlement, bad).toBeUndefined();
    }
  });

  it('refuses amounts outside anything a retail holding reaches', () => {
    expect(readQuoteParams('?face=400000').face).toBe(400_000);
    expect(readQuoteParams('?face=-1').face).toBeUndefined();
    expect(readQuoteParams('?face=99999999999999').face).toBeUndefined();
    expect(readQuoteParams('?commission=abc').commission).toBeUndefined();
  });

  it('refuses an impossible yield', () => {
    expect(readQuoteParams('?quotedYTM=13.2').quotedYTM).toBe(13.2);
    expect(readQuoteParams('?quotedYTM=-4').quotedYTM).toBeUndefined();
    expect(readQuoteParams('?quotedYTM=1000').quotedYTM).toBeUndefined();
  });

  /* Dropping the whole quote because one field was edited would punish the
   * recipient for somebody else's tampering. The rest is still the sender's. */
  it('keeps the good fields when one is tampered with', () => {
    const got = readQuoteParams('?isin=KE1000001493&face=400000&dirty=1e400');
    expect(got.isin).toBe('KE1000001493');
    expect(got.face).toBe(400_000);
    expect(got.dirty).toBeUndefined();
  });

  it('ignores fields the page did not ask for, and an empty query', () => {
    expect(readQuoteParams('?face=400000&evil=payload')).toEqual({ face: 400_000 });
    expect(readQuoteParams('')).toEqual({});
    expect(readQuoteParams('?')).toEqual({});
  });
});

describe('shareableQuoteUrl', () => {
  it('is absolute, so it survives being pasted anywhere', () => {
    const url = shareableQuoteUrl(FULL, 'https://mwangazayield.org');
    expect(url.startsWith('https://mwangazayield.org/sell/?')).toBe(true);
  });

  it('degrades to the plain page when there is nothing to carry', () => {
    expect(shareableQuoteUrl({}, 'https://mwangazayield.org')).toBe(
      'https://mwangazayield.org/sell/'
    );
  });
});
