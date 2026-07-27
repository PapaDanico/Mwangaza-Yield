import { describe, it, expect } from 'vitest';
import auctionsData from '../../public/data/auction-results.json';
import type { AuctionPrint } from '../../src/types/bond';
import {
  auctionDemand,
  demandSummary,
  median,
  MIN_AUCTIONS_FOR_A_MEDIAN,
} from '../../src/lib/subscription';

const PRINTS = auctionsData as unknown as AuctionPrint[];

/** A record carrying only what this module reads. */
function print(
  sourceUrl: string,
  auctionDate: string,
  issueCode: string,
  offered: number,
  bids: number,
  accepted: number,
  bidsLabel = 'total bids received at cost (kshs. m)'
): AuctionPrint {
  return {
    sourceUrl,
    auctionDate,
    issueCode,
    amountOfferedKESM: offered,
    bidsReceivedKESM: bids,
    amountAcceptedKESM: accepted,
    bidsLabel,
  } as AuctionPrint;
}

describe('grouping, which is the whole correctness question here', () => {
  /**
   * The per-bond trap, pinned with the real auction that shows it.
   *
   * 27 July 2026 offered Ksh 40bn across two bonds and drew 23,968 + 61,960.
   * Dividing either leg by the auction-level offer reports 0.60x or 1.55x for
   * an auction that was bid 2.15x. Both readings are wrong and the second is
   * wrong in the flattering direction.
   */
  it('sums bids across the bonds of one auction rather than dividing each by the whole offer', () => {
    const rows = auctionDemand([
      print('u1', '2026-07-27', 'FXD1/2019/020', 40000, 23968.43, 12249.13),
      print('u1', '2026-07-27', 'FXD1/2022/025', 40000, 61960.51, 51034.12),
    ]);
    expect(rows.length, 'one auction should produce one row, not two').toBe(1);
    expect(rows[0].offeredKESM, 'the offer was counted twice').toBe(40000);
    expect(rows[0].subscription).toBeCloseTo(2.148, 3);
    expect(rows[0].issueCodes).toEqual(['FXD1/2019/020', 'FXD1/2022/025']);
  });

  /**
   * The by-date trap, also pinned with the real case.
   *
   * 17 February 2025 held two separate auctions in two documents, offering
   * Ksh 50bn and Ksh 70bn. Keying on the date fuses them into one auction with
   * one offer and six legs of bids.
   */
  it('keeps two auctions held on the same day apart', () => {
    const rows = auctionDemand([
      print('doc-a', '2025-02-17', 'FXD1/2020/005', 50000, 40073.94, 20000),
      print('doc-a', '2025-02-17', 'FXD1/2022/003', 50000, 10277.42, 5000),
      print('doc-b', '2025-02-17', 'IFB1/2022/014', 70000, 93132.02, 60000),
      print('doc-b', '2025-02-17', 'IFB1/2023/017', 70000, 100765.93, 60000),
    ]);
    expect(rows.length, 'same-day auctions were fused').toBe(2);
    const offers = rows.map((r) => r.offeredKESM).sort((a, b) => a - b);
    expect(offers).toEqual([50000, 70000]);
    // And neither inherited the other's demand.
    const byOffer = new Map(rows.map((r) => [r.offeredKESM, r]));
    expect(byOffer.get(50000)!.bidsReceivedKESM).toBeCloseTo(50351.36, 2);
    expect(byOffer.get(70000)!.bidsReceivedKESM).toBeCloseTo(193897.95, 2);
  });

  it('drops an auction whose records disagree about the offer rather than averaging it', () => {
    const rows = auctionDemand([
      print('u2', '2024-01-01', 'A', 50000, 10000, 8000),
      print('u2', '2024-01-01', 'B', 60000, 10000, 8000),
    ]);
    expect(rows.length, 'a contradictory offer produced a number anyway').toBe(0);
  });

  it('ignores records missing either side of the ratio', () => {
    const rows = auctionDemand([
      { sourceUrl: 'u3', auctionDate: '2024-01-01', issueCode: 'A' } as AuctionPrint,
      print('u4', '2024-01-01', 'B', 0, 100, 50),
    ]);
    expect(rows.length).toBe(0);
  });
});

describe('the ratios themselves', () => {
  it('separates demand from what the Treasury actually took', () => {
    // 13 July 2026: bid 2.06x, accepted 1.01x. The money was there and half of
    // it was refused — which is a decision about price, not a lack of demand,
    // and the two ratios are the only way to see it.
    const rows = auctionDemand([print('u5', '2026-07-13', 'A', 30000, 61800, 30300)]);
    expect(rows[0].subscription).toBeCloseTo(2.06, 2);
    expect(rows[0].takeUp).toBeCloseTo(1.01, 2);
  });

  /**
   * The mismatch this test suite found in the live archive.
   *
   * The 10 August 2020 tap sale states bids at FACE value (40,262.55) and
   * acceptance at cost (41,006.20), so it appears to have accepted 1.85% more
   * than was bid. Four auctions do this. The parser allows it on purpose —
   * _refuse_contradictions has a case for exactly this — and the arithmetic
   * here has to allow it too, without pretending the ratio means anything.
   *
   * My first version of this module divided anyway and my first version of
   * this test asserted accepted <= bids, so the check caught it. Reporting
   * 102.5% take-up would have read a currency difference as the Treasury
   * over-allotting.
   */
  it('refuses a take-up ratio when bids and acceptance are on different bases', () => {
    const face = auctionDemand([
      print('u6', '2020-08-10', 'FXD2/2018/020', 40000, 40262.55, 41006.2,
        'total bids received at face value (kes million)'),
    ]);
    expect(face[0].bidsAtFaceValue).toBe(true);
    expect(face[0].takeUp, 'a take-up ratio was computed across two bases').toBeNull();
    // Subscription still stands: bids and the offer are both face amounts.
    expect(face[0].subscription).toBeCloseTo(1.007, 3);

    const cost = auctionDemand([print('u7', '2026-07-13', 'A', 30000, 61800, 30300)]);
    expect(cost[0].bidsAtFaceValue).toBe(false);
    expect(cost[0].takeUp).not.toBeNull();
  });

  it('returns rows oldest first', () => {
    const rows = auctionDemand([
      print('b', '2025-01-01', 'A', 100, 100, 100),
      print('a', '2024-01-01', 'B', 100, 100, 100),
    ]);
    expect(rows.map((r) => r.auctionDate)).toEqual(['2024-01-01', '2025-01-01']);
  });

  it('has a median that is actually the median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('measured on the shipped archive', () => {
  const rows = auctionDemand(PRINTS);

  it('finds a usable run of auctions', () => {
    expect(rows.length).toBeGreaterThan(150);
  });

  it('never reports an auction twice', () => {
    expect(new Set(rows.map((r) => r.sourceUrl)).size).toBe(rows.length);
  });

  it('produces ratios inside the range a bond auction can occupy', () => {
    for (const r of rows) {
      expect(r.subscription, `${r.auctionDate} subscription ${r.subscription}`).toBeGreaterThan(0);
      expect(r.subscription, `${r.auctionDate} subscription ${r.subscription}`).toBeLessThan(20);
      // The Treasury cannot accept more than was bid — but only where the two
      // figures are in the same currency of meaning. Where they are not, the
      // module must have declined to compare them.
      if (r.bidsAtFaceValue) {
        expect(r.takeUp, `${r.auctionDate} compared across bases`).toBeNull();
      } else {
        expect(
          r.amountAcceptedKESM,
          `${r.auctionDate} accepted more than was bid on a single basis`
        ).toBeLessThanOrEqual(r.bidsReceivedKESM + 1e-6);
      }
    }
  });

  it('finds the face-value auctions rather than assuming they are gone', () => {
    // If a future parser change normalises the basis, this fails and the
    // null-take-up branch above becomes dead code that nothing would notice.
    expect(rows.filter((r) => r.bidsAtFaceValue).length).toBeGreaterThan(0);
  });

  it('summarises without inventing a median from a handful', () => {
    const s = demandSummary(PRINTS);
    expect(s).not.toBeNull();
    expect(s!.medianSubscription).not.toBeNull();
    expect(s!.medianSubscriptionAllTime).not.toBeNull();
    expect(s!.undersubscribed).toBeLessThanOrEqual(s!.recent.length);
    expect(demandSummary(PRINTS.slice(0, 2))).toBeNull();
  });

  it('says nothing when the window is too thin rather than quoting one auction', () => {
    const s = demandSummary(PRINTS, MIN_AUCTIONS_FOR_A_MEDIAN - 1);
    expect(s!.medianSubscription, 'a median was quoted from under the threshold').toBeNull();
    // The all-time figure still stands, because it is drawn from everything.
    expect(s!.medianSubscriptionAllTime).not.toBeNull();
  });
});
