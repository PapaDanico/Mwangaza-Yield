import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The auction archive loads on demand (useAuctionArchive), not with every
 * page's data. fetchData pulling it back in would put ~28 KB compressed, a
 * 400-row IndexedDB read and an idle rewrite on every page view again,
 * including the many pages that never read it (27 Nov 2026).
 */
describe('auction archive is loaded on demand', () => {
  const src = readFileSync('src/stores/bondStore.ts', 'utf8');
  const fetchData = src.slice(src.indexOf('fetchData: async'), src.indexOf('loadArchive: () => {'));

  it('fetchData neither fetches nor reads nor writes the archive', () => {
    expect(fetchData).not.toContain('auction-results.json');
    expect(fetchData).not.toContain('db.auctionResults');
  });

  it('components read it through the hook, which triggers the load', () => {
    expect(src).toMatch(/export function useAuctionArchive/);
    expect(src).toContain("loadJSON<AuctionPrint[]>('/data/auction-results.json')");
  });
});
