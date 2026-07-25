import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import {
  PLAUSIBLE_COVER,
  availableMonths,
  auctionKind,
  buildMonthlyReview,
  evidenceLine,
  monthLabel,
} from '../../src/lib/auction-review';
import type { AuctionPrint } from '../../src/types/bond';

const p = (over: Partial<AuctionPrint>): AuctionPrint => ({
  id: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/10',
  auctionDate: '2024-06-17',
  ...over,
});

describe('monthLabel', () => {
  it('reads as a person would write it', () => {
    expect(monthLabel('2026-07')).toBe('July 2026');
  });
  it('passes through anything it does not recognise', () => {
    expect(monthLabel('nonsense')).toBe('nonsense');
  });
});

describe('the per-auction offered amount', () => {
  it('is counted once for a multi-bond auction, not once per bond', () => {
    // The archive stores the auction's total against every bond in it. Summing
    // would report the Treasury asking for 90bn when it asked for 30bn.
    const r = buildMonthlyReview(
      [
        p({ issueCode: 'FXD1/2022/10', amountOfferedKESM: 30_000, bidsReceivedKESM: 45_000 }),
        p({ issueCode: 'FXD1/2021/20', amountOfferedKESM: 30_000 }),
        p({ issueCode: 'FXD1/2026/30', amountOfferedKESM: 30_000 }),
      ],
      '2024-06'
    );
    expect(r.auctionCount).toBe(1);
    expect(r.rows[0].offeredKESM).toBe(30_000);
    expect(r.totalOfferedKESM).toBe(30_000);
  });

  it('takes the largest when rows disagree, treating a smaller one as a partial read', () => {
    const r = buildMonthlyReview(
      [
        p({ issueCode: 'A', amountOfferedKESM: 30_000 }),
        p({ issueCode: 'B', amountOfferedKESM: 12_000 }),
      ],
      '2024-06'
    );
    expect(r.rows[0].offeredKESM).toBe(30_000);
  });

  it('lists every issue code in the auction, sorted and deduplicated', () => {
    const r = buildMonthlyReview(
      [p({ issueCode: 'IFB1/2024/09' }), p({ issueCode: 'FXD1/2024/10' }), p({ issueCode: 'FXD1/2024/10' })],
      '2024-06'
    );
    expect(r.rows[0].issueCodes).toEqual(['FXD1/2024/10', 'IFB1/2024/09']);
  });
});

describe('bid-to-cover, and refusing to report a misparse as a market event', () => {
  it('computes a plausible ratio', () => {
    const r = buildMonthlyReview(
      [p({ amountOfferedKESM: 30_000, bidsReceivedKESM: 45_000 })],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeCloseTo(1.5);
    expect(r.rows[0].coverRejected).toBe(false);
    expect(r.measured).toBe(1);
  });

  it('discards the billions-versus-millions misparse rather than calling it weak demand', () => {
    // The real shape of the fault: bids carries the offered amount in billions
    // while offered is in millions. A cover of 0.001 is a broken column, not a
    // failed auction, and reporting it as the latter would be a lie with a
    // number attached.
    const r = buildMonthlyReview(
      [p({ amountOfferedKESM: 30_000, bidsReceivedKESM: 30 })],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeUndefined();
    expect(r.rows[0].coverRejected).toBe(true);
    expect(r.measured).toBe(0);
    expect(r.rejected).toBe(1);
  });

  it('still reports genuine undersubscription, which is news', () => {
    // 0.4x is a real and interesting outcome. The guard must not tidy it away.
    const r = buildMonthlyReview(
      [p({ amountOfferedKESM: 30_000, bidsReceivedKESM: 12_000 })],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeCloseTo(0.4);
    expect(r.rows[0].coverRejected).toBe(false);
  });

  it('keeps the band wide enough to admit a heavily oversubscribed auction', () => {
    const r = buildMonthlyReview(
      [p({ amountOfferedKESM: 10_000, bidsReceivedKESM: 71_000 })],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeCloseTo(7.1);
  });

  it('rejects at the boundaries rather than inside them', () => {
    const [lo, hi] = PLAUSIBLE_COVER;
    const at = (cover: number) =>
      buildMonthlyReview([p({ amountOfferedKESM: 10_000, bidsReceivedKESM: 10_000 * cover })], '2024-06')
        .rows[0];
    expect(at(lo).bidToCover).toBeDefined();
    expect(at(hi).bidToCover).toBeDefined();
    expect(at(lo / 2).coverRejected).toBe(true);
    expect(at(hi * 2).coverRejected).toBe(true);
  });

  it('says nothing at all when only one side is present', () => {
    const r = buildMonthlyReview([p({ amountOfferedKESM: 30_000 })], '2024-06');
    expect(r.rows[0].bidToCover).toBeUndefined();
    expect(r.rows[0].coverRejected).toBe(false); // absent is not rejected
  });

  // The bug that shipped a false finding. None of the tests above caught it,
  // because every fixture happened to carry bids on all of its rows.
  it('refuses the ratio when one bond of a multi-bond auction has no bids figure', () => {
    // Bids are per bond; offered is for the whole auction. A partial numerator
    // over a whole denominator understates cover by roughly the number of
    // bonds — which reported Kenyan auctions as undersubscribed when they are
    // in fact persistently oversubscribed.
    const r = buildMonthlyReview(
      [
        p({ issueCode: 'FXD1/2018/025', amountOfferedKESM: 50_000 }),
        p({ issueCode: 'FXD3/2019/015', amountAcceptedKESM: 54_786, bidsReceivedKESM: 133_792 }),
      ],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeUndefined();
    expect(r.measured).toBe(0);
    // Not "rejected" either — the figure was never computable, as opposed to
    // computed and found impossible. Conflating the two would hide a data gap
    // inside a parse-failure count.
    expect(r.rows[0].coverRejected).toBe(false);
  });

  it('reports the true ratio once every bond in the auction carries its bids', () => {
    // The same February 2026 auction as CBK published it: 213.7bn against a
    // 50bn target, which is 4.27x — oversubscribed, as the market record says.
    const r = buildMonthlyReview(
      [
        p({ issueCode: 'FXD1/2018/025', amountOfferedKESM: 50_000, bidsReceivedKESM: 79_900 }),
        p({ issueCode: 'FXD3/2019/015', bidsReceivedKESM: 133_800 }),
      ],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeCloseTo(4.274, 2);
    expect(r.measured).toBe(1);
  });

  it('still measures a genuine single-bond auction', () => {
    const r = buildMonthlyReview(
      [p({ amountOfferedKESM: 10_000, bidsReceivedKESM: 21_000 })],
      '2024-06'
    );
    expect(r.rows[0].bidToCover).toBeCloseTo(2.1);
  });
});

describe('uptake', () => {
  it('reports what the Treasury actually raised against what it asked', () => {
    const r = buildMonthlyReview(
      [p({ amountOfferedKESM: 30_000, amountAcceptedKESM: 24_000 })],
      '2024-06'
    );
    expect(r.rows[0].uptakePct).toBeCloseTo(80);
    expect(r.uptakePct).toBeCloseTo(80);
  });

  it('withholds the monthly figure when an auction is missing its offered amount', () => {
    // Dividing a complete numerator by a partial denominator produces a number
    // that looks like uptake and is not.
    const r = buildMonthlyReview(
      [
        p({ auctionDate: '2024-06-03', amountOfferedKESM: 30_000, amountAcceptedKESM: 24_000 }),
        p({ auctionDate: '2024-06-17', amountAcceptedKESM: 18_000 }),
      ],
      '2024-06'
    );
    expect(r.auctionCount).toBe(2);
    expect(r.uptakePct).toBeUndefined();
  });
});

describe('the comparison window', () => {
  const prints = [
    p({ auctionDate: '2024-01-08', amountOfferedKESM: 10_000, bidsReceivedKESM: 10_000 }),
    p({ auctionDate: '2024-02-12', amountOfferedKESM: 10_000, bidsReceivedKESM: 20_000 }),
    p({ auctionDate: '2024-03-11', amountOfferedKESM: 10_000, bidsReceivedKESM: 30_000 }),
  ];

  it('excludes the month under review from its own comparison', () => {
    const r = buildMonthlyReview(prints, '2024-03');
    expect(r.medianCover).toBeCloseTo(3);
    expect(r.priorMedianCover).toBeCloseTo(1.5); // median of 1.0 and 2.0
    expect(r.priorMonthsCounted).toBe(2);
  });

  it('reports how many prior months it actually found', () => {
    const r = buildMonthlyReview(prints, '2024-01');
    expect(r.priorMedianCover).toBeUndefined();
    expect(r.priorMonthsCounted).toBe(0);
  });
});

describe('evidenceLine', () => {
  it('states the basis when everything is measurable', () => {
    const r = buildMonthlyReview([p({ amountOfferedKESM: 30_000, bidsReceivedKESM: 45_000 })], '2024-06');
    expect(evidenceLine(r)).toBe('1 auction in June 2024, 1 with demand figures complete enough to measure.');
  });

  it('names discarded rows rather than hiding them', () => {
    const r = buildMonthlyReview(
      [
        p({ auctionDate: '2024-06-03', amountOfferedKESM: 30_000, bidsReceivedKESM: 45_000 }),
        p({ auctionDate: '2024-06-17', amountOfferedKESM: 30_000, bidsReceivedKESM: 30 }),
      ],
      '2024-06'
    );
    expect(evidenceLine(r)).toContain('1 discarded as unreadable');
  });

  it('admits a month it could not measure at all', () => {
    const r = buildMonthlyReview([p({ amountOfferedKESM: 30_000 })], '2024-06');
    expect(evidenceLine(r)).toContain('None carried figures complete enough');
  });

  it('admits a month with no auctions', () => {
    expect(evidenceLine(buildMonthlyReview([], '2024-06'))).toBe(
      'No auction results recorded for June 2024.'
    );
  });
});

describe('against the real archive', () => {
  const prints = archive as unknown as AuctionPrint[];

  it('finds months to review', () => {
    // Deliberately loose. This asserts the archive is usable, not that it is a
    // particular size — the parser's strictness changes the record count
    // legitimately, and a test that pins the snapshot fails on every
    // improvement to the parser rather than on any real defect.
    expect(availableMonths(prints).length).toBeGreaterThan(10);
  });

  it('lists months newest first', () => {
    const m = availableMonths(prints);
    expect(m).toEqual([...m].sort((a, b) => b.localeCompare(a)));
  });

  it('never publishes an implausible cover ratio for any month in the archive', () => {
    const bad: string[] = [];
    for (const m of availableMonths(prints)) {
      for (const row of buildMonthlyReview(prints, m).rows) {
        if (row.bidToCover === undefined) continue;
        if (row.bidToCover < PLAUSIBLE_COVER[0] || row.bidToCover > PLAUSIBLE_COVER[1]) {
          bad.push(`${row.date}: ${row.bidToCover}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('collapses multi-bond auctions so no month has more auctions than dates', () => {
    for (const m of availableMonths(prints).slice(0, 24)) {
      const r = buildMonthlyReview(prints, m);
      expect(r.rows.length).toBe(new Set(r.rows.map((x) => x.date)).size);
    }
  });

  it('publishes no cover ratio it cannot stand behind', () => {
    // This replaces a test that demanded the live archive still CONTAIN a
    // defect ("the guard is not decorative"). Parser version 5 fixed the
    // billions-for-millions misparse, so that assertion started failing on
    // data getting better — the worst reason for a test to go red. The guard
    // is exercised directly on synthetic rows above; here we only require that
    // whatever survives is defensible.
    for (const m of availableMonths(prints)) {
      const r = buildMonthlyReview(prints, m);
      expect(r.measured).toBeLessThanOrEqual(r.auctionCount);
      expect(r.rejected).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('auctionKind — what kind of sale this was', () => {
  it('reads a switch from the name CBK gave the file', () => {
    expect(auctionKind('/uploads/x/376777690_SWITCH RESULTS FXD1-2018-015 DATED 15-04-2026.pdf'))
      .toBe('switch');
  });

  it('reads a tap sale', () => {
    expect(auctionKind('/uploads/x/838376338_TAP SALE RESULTS IFB1-2022-14 DATED 28-11-2022.pdf'))
      .toBe('tap');
  });

  it('treats an ordinary results file as a primary auction', () => {
    expect(auctionKind('/uploads/x/RESULTS FXD3-2019-015 AND FXD1-2018-025 DATED 16-02-2026.pdf'))
      .toBe('primary');
  });

  it('decodes a percent-encoded name before reading it', () => {
    expect(auctionKind('/uploads/x/results%20switch%20ifb1-2020-6%20dated%2001.06.2020.pdf'))
      .toBe('switch');
  });

  it('does not mistake a word merely containing "tap" for a tap sale', () => {
    // "ADAPTATION", "TAPERED" — the word boundary is what keeps this from
    // silently excluding real auctions from the only statistic that counts them.
    expect(auctionKind('/uploads/x/RESULTS GREEN ADAPTATION BOND DATED 01-01-2026.pdf'))
      .toBe('primary');
  });

  it('survives a malformed escape rather than throwing', () => {
    // decodeURIComponent throws on a lone %. A results file with one must still
    // be classified, not take the whole review down.
    expect(auctionKind('/uploads/x/RESULTS 100% SWITCH DATED 01-01-2026.pdf')).toBe('switch');
  });

  it('defaults to primary when there is no source at all', () => {
    expect(auctionKind(undefined)).toBe('primary');
  });
});

describe('a switch auction produces no cover ratio', () => {
  // A switch is a debt exchange: holders swap a maturing bond for a longer one
  // and no cash is raised, so "bids" are paper offered for exchange. Dividing
  // them by the target measures participation in a restructuring, not appetite
  // for Kenyan debt. The archive's switch auctions sit at 0.82x and 0.13x, and
  // pooling those with primary auctions is how a review reports failed auctions
  // where nothing failed.
  const swap: AuctionPrint[] = [
    {
      id: 'a', issueCode: 'FXD1/2018/015', auctionDate: '2026-04-15',
      amountOfferedKESM: 20000, amountAcceptedKESM: 1753.13, bidsReceivedKESM: 2559.51,
      sourceUrl: '/uploads/x/SWITCH RESULTS FXD1-2018-015 DATED 15-04-2026.pdf',
    } as unknown as AuctionPrint,
  ];

  it('reports the figures but computes no ratio from them', () => {
    const row = buildMonthlyReview(swap, '2026-04').rows[0];
    expect(row.kind).toBe('switch');
    expect(row.bidsKESM).toBe(2559.51);      // the figure is real and is shown
    expect(row.bidToCover).toBeUndefined();  // the ratio is not a demand signal
  });

  it('and is not counted as a rejected measurement either', () => {
    // Rejection means "we had the numbers and they were impossible". This is
    // "the numbers are fine and the question does not apply" — recording it as
    // a rejection would overstate how much of the archive is broken.
    expect(buildMonthlyReview(swap, '2026-04').rows[0].coverRejected).toBe(false);
    expect(buildMonthlyReview(swap, '2026-04').measured).toBe(0);
    expect(buildMonthlyReview(swap, '2026-04').rejected).toBe(0);
  });

  it('leaves an otherwise identical primary auction measurable', () => {
    const primary = [{ ...swap[0], sourceUrl: '/uploads/x/RESULTS FXD1-2018-015 DATED 15-04-2026.pdf' }] as AuctionPrint[];
    const row = buildMonthlyReview(primary, '2026-04').rows[0];
    expect(row.kind).toBe('primary');
    expect(row.bidToCover).toBeCloseTo(0.128, 3);
  });
});
