// @ts-nocheck -- imports a .mts Netlify function, outside the app's tsconfig module resolution
import { describe, expect, it } from 'vitest';
import archive from '../../public/data/auction-results.json';
import { gapDocs, GAP_DOCS_PER_RUN } from '../../netlify/functions/cbk-gaps.mts';

const row = (id: string, sourceUrl: string | undefined, over: Record<string, unknown> = {}) => ({
  id,
  sourceUrl,
  auctionDate: '2014-06-30',
  couponRate: 11.9,
  pricePer100: 99.1,
  amountOfferedKESM: 10000,
  amountAcceptedKESM: 9000,
  bidsReceivedKESM: 12000,
  ...over,
});

describe('gapDocs', () => {
  it('lists only documents behind rows that miss a core field, with what each is wanted for', () => {
    const docs = gapDocs([
      row('whole', 'https://www.centralbank.go.ke/uploads/a.pdf'),
      row('gap1', 'https://www.centralbank.go.ke/uploads/b.pdf', { couponRate: null }),
      row('gap2', 'https://www.centralbank.go.ke/uploads/b.pdf', { pricePer100: 0 }),
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0].file).toBe('b.pdf');
    expect(docs[0].rows).toEqual([
      { id: 'gap1', missing: ['couponRate'] },
      { id: 'gap2', missing: ['pricePer100'] },
    ]);
  });

  it('never follows a link off CBK, over plain http, or to a non-PDF', () => {
    const miss = { couponRate: null };
    expect(
      gapDocs([
        row('a', 'https://evil.example/x.pdf', miss),
        row('b', 'http://www.centralbank.go.ke/x.pdf', miss),
        row('c', 'https://www.centralbank.go.ke/x.html', miss),
        row('d', 'https://www.centralbank.go.ke.evil.example/x.pdf', miss),
        row('e', undefined, miss),
        row('f', 'not a url', miss),
      ]),
    ).toEqual([]);
  });

  it('encodes spaces in a document name so the fetch is a valid URL', () => {
    const [doc] = gapDocs([row('a', 'https://www.centralbank.go.ke//uploads/Tap sale advert.pdf', { couponRate: null })]);
    expect(doc.url).toContain('Tap%20sale%20advert.pdf');
    expect(doc.file).toBe('Tap sale advert.pdf');
  });

  it('shrinks as rows are completed, so a fixed row is never fetched again', () => {
    const before = gapDocs(archive as never);
    expect(before.length).toBeGreaterThan(0);
    const fixed = (archive as never as Record<string, unknown>[]).map((r) =>
      r.sourceUrl === before[0].url ? { ...r, auctionDate: '2014-06-30', couponRate: 1, pricePer100: 1, amountOfferedKESM: 1, amountAcceptedKESM: 1, bidsReceivedKESM: 1 } : r,
    );
    expect(gapDocs(fixed as never).some((d) => d.url === before[0].url)).toBe(false);
  });

  it('reads a bounded handful per run', () => {
    expect(GAP_DOCS_PER_RUN).toBeLessThanOrEqual(10);
  });
});
