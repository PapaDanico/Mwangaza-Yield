import { describe, expect, it } from 'vitest';
import results from '../../public/data/auction-results.json';

/**
 * Every result record must name the document it came from.
 *
 * `auctionDemand` (src/lib/subscription.ts) groups bonds into auctions by
 * sourceUrl and silently skips a record that has none. Eight hand-entered
 * records from late August and September 2026 carried no sourceUrl, so the
 * "How contested the recent auctions were" card stopped at 17 August while the
 * September review above it listed three later auctions. Nothing failed; the
 * newest auctions simply vanished from one analysis. A record without a source
 * is also a record whose provenance cannot be checked.
 */
describe('auction-results provenance', () => {
  it('gives every record a sourceUrl on CBK', () => {
    const missing = (results as { id: string; sourceUrl?: string }[])
      .filter((r) => !r.sourceUrl || !/^https:\/\/www\.centralbank\.go\.ke\//.test(r.sourceUrl))
      .map((r) => r.id);
    expect(missing).toEqual([]);
  });
});
