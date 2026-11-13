// @ts-nocheck -- imports a .mts Netlify function, outside the app's tsconfig module resolution
import { describe, expect, it } from 'vitest';
import archive from '../../public/data/auction-results.json';
import { gapDocs, verifyDocs, pendingDocs, EXTRA_DOCS, GAP_DOCS_PER_RUN } from '../../netlify/functions/cbk-gaps.mts';

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

describe('verifyDocs', () => {
  const ok = (id: string, url: string, date: string) => row(id, url, { auctionDate: date });
  it('lists multi-bond notices from before 2020 that back complete-looking rows', () => {
    const docs = verifyDocs([
      ok('a1', 'https://www.centralbank.go.ke/u/two-bonds.pdf', '2011-05-30'),
      ok('a2', 'https://www.centralbank.go.ke/u/two-bonds.pdf', '2011-05-30'),
      ok('b1', 'https://www.centralbank.go.ke/u/one-bond.pdf', '2011-06-27'),
      ok('c1', 'https://www.centralbank.go.ke/u/recent.pdf', '2024-06-24'),
      ok('c2', 'https://www.centralbank.go.ke/u/recent.pdf', '2024-06-24'),
    ]);
    expect(docs.map((d) => d.file)).toEqual(['two-bonds.pdf']);
    expect(docs[0].tier).toBe('verify');
  });

  it('leaves a gap document to the gap tier, and reads gap documents first', () => {
    const rows = [
      row('g1', 'https://www.centralbank.go.ke/u/gap.pdf', { couponRate: null, auctionDate: '2011-01-31' }),
      row('g2', 'https://www.centralbank.go.ke/u/gap.pdf', { auctionDate: '2011-01-31' }),
      ok('v1', 'https://www.centralbank.go.ke/u/verify.pdf', '2012-07-30'),
      ok('v2', 'https://www.centralbank.go.ke/u/verify.pdf', '2012-07-30'),
    ];
    expect(verifyDocs(rows).map((d) => d.file)).toEqual(['verify.pdf']);
    expect(pendingDocs(rows).map((d) => `${d.tier}:${d.file}`)).toEqual(['gap:gap.pdf', 'verify:verify.pdf', ...EXTRA_DOCS.map((d) => `extra:${d.file}`)]);
  });

  it('never follows a link off CBK', () => {
    expect(
      verifyDocs([
        ok('x1', 'https://evil.example/a.pdf', '2011-05-30'),
        ok('x2', 'https://evil.example/a.pdf', '2011-05-30'),
      ]),
    ).toEqual([]);
  });
});

describe('verifyDocs: rows that contradict themselves', () => {
  it('reads a post-2020 notice when its row accepts more than it received, and not otherwise', () => {
    const url = 'https://www.centralbank.go.ke/uploads/x.pdf';
    const bad = row('bad', url, { auctionDate: '2023-12-11', amountAcceptedKESM: 47866.93, bidsReceivedKESM: 47238.75 });
    const fine = row('fine', 'https://www.centralbank.go.ke/uploads/y.pdf', { auctionDate: '2023-12-11' });
    const docs = verifyDocs([bad, fine]);
    expect(docs.map((d) => d.file)).toEqual(['x.pdf']);
    expect(docs[0].rows[0]).toMatchObject({ id: 'bad', contradicts: true });
  });

  it('never flags a tap sale, which is accepted at cost against bids at face', () => {
    const tap = row('tap', 'https://www.centralbank.go.ke/uploads/t.pdf', { auctionDate: '2023-12-11', transactionType: 'tap', amountAcceptedKESM: 9, bidsReceivedKESM: 5 });
    expect(verifyDocs([tap])).toEqual([]);
  });
});

describe('EXTRA_DOCS', () => {
  it('names exactly the documents wanted for their own series, on a registered publisher, https only', () => {
    expect(EXTRA_DOCS.length).toBeGreaterThan(0);
    for (const d of EXTRA_DOCS) {
      const u = new URL(d.url);
      expect(u.protocol).toBe('https:');
      expect(u.hostname).toBe('www.treasury.go.ke');
      expect(u.pathname).toMatch(/\.pdf$/i);
      expect(d.tier).toBe('extra');
    }
  });
});

