// @ts-nocheck -- tests a plain .mjs maintenance script
import { describe, expect, it } from 'vitest';
import { diff, isoDate, parseExtract } from '../../scripts/cbk-watch-diff.mjs';

/* The sidebar as cbk-watch read it on 4 Oct 2026. */
const EXTRACT = `US DOLLAR: 129.76 (02-10-2026)
Central Bank Rate: 8.75% (11/08/2026)
91-Day T-Bill: 8.778% (05/10/2026)
Inflation Rate: 6.6% (August,2026)`;

const held = {
  macro: [
    { indicator: 'FX_USD_KES', value: 129.71, date: '2026-10-01' },
    { indicator: 'CBR', value: 8.75, date: '2026-08-11' },
  ],
  tbills: [{ tenorDays: 91, discountRate: 8.7694, auctionDate: '2026-10-01' }],
  cpiHistory: [{ indicator: 'CPI', value: 6.8, date: '2026-09-01' }],
};

describe('cbk-watch-diff', () => {
  it('reads CBK date formats', () => {
    expect(isoDate('02-10-2026')).toBe('2026-10-02');
    expect(isoDate('11/08/2026')).toBe('2026-08-11');
    expect(isoDate('August,2026')).toBe('2026-08-01');
    expect(isoDate(null)).toBeNull();
  });

  it('classifies each sidebar figure against what is held', () => {
    const by = Object.fromEntries(diff(parseExtract(EXTRACT), held).map((f) => [f.label, f]));
    expect(by['US DOLLAR'].status).toBe('newer');
    expect(by['US DOLLAR'].stub).toMatchObject({ value: 129.76, date: '2026-10-02', via: 'cbk-home' });
    expect(by['CENTRAL BANK RATE'].status).toBe('same');
    // Same auction (Thursday 1 Oct is value-dated Monday 5 Oct), different
    // figure: a conflict to look at, never a "newer" to write.
    expect(by['91-DAY T-BILL'].status).toBe('conflict');
    expect(by['91-DAY T-BILL'].stub).toBeUndefined();
    expect(by['INFLATION RATE'].status).toBe('older');
  });
});
