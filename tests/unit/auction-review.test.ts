import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import {
  PLAUSIBLE_COVER,
  availableMonths,
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
    expect(availableMonths(prints).length).toBeGreaterThan(50);
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

  it('does actually reject rows in the real data — the guard is not decorative', () => {
    const rejected = availableMonths(prints)
      .map((m) => buildMonthlyReview(prints, m).rejected)
      .reduce((a, b) => a + b, 0);
    expect(rejected).toBeGreaterThan(0);
  });
});
