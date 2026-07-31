import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import bondsData from '../../public/data/bonds.json';
import {
  GUIDANCE_FROM,
  MIN_SAMPLE,
  bidGuidance,
  demandByAuction,
  describeDemand,
  findComparables,
  readBid,
  yearsToMaturityAt,
} from '../../src/lib/bid';
import { normaliseCode } from '../../src/lib/auction-history';
import type { AuctionPrint, Bond } from '../../src/types/bond';

const prints = (archive as { results?: AuctionPrint[] }).results
  ?? (archive as unknown as AuctionPrint[]);
const bonds = (bondsData as { bonds?: Bond[] }).bonds ?? (bondsData as unknown as Bond[]);

const p = (over: Partial<AuctionPrint>): AuctionPrint => ({
  id: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/010',
  auctionDate: '2024-06-17',
  weightedAverageRate: 14,
  ...over,
});

const b = (over: Partial<Bond>): Bond => ({
  isin: Math.random().toString(36).slice(2),
  issueCode: 'FXD1/2024/010',
  name: 'test',
  category: 'FXD',
  issueDate: '2024-06-24',
  maturityDate: '2034-06-12',
  tenorYears: 10,
  couponRate: 14,
  couponFrequencyPerYear: 2,
  ytmGross: 14,
  minInvestmentKES: 50_000,
  taxExempt: false,
  ...over,
});

/* ------------------------------------------------------------------ trap 1 */

describe('TRAP 1: the tenor in the issue code is not the tenor being bid', () => {
  /**
   * Measured on the live archive before this module was written: FXD2/2013/015
   * is labelled a 15-year bond, and the re-opening in the archive was bid with
   * about 5.7 years left to run. Bucketing on the label would compare that bid
   * against fifteen-year history.
   */
  it('the mislabelling is real in the shipped data, not hypothetical', () => {
    const byCode = new Map(bonds.map((x) => [normaliseCode(x.issueCode), x]));
    let misleading = 0;
    let matched = 0;
    let worstCase: { code: string; label: number; actual: number } | null = null;

    for (const pr of prints) {
      if (!pr.auctionDate || pr.auctionDate < GUIDANCE_FROM) continue;
      const bond = byCode.get(normaliseCode(pr.issueCode));
      if (!bond) continue;
      matched++;
      const actual = yearsToMaturityAt(bond, new Date(pr.auctionDate));
      const gap = bond.tenorYears - actual;
      if (gap > 1.5) {
        misleading++;
        if (!worstCase || gap > worstCase.label - worstCase.actual) {
          worstCase = { code: pr.issueCode, label: bond.tenorYears, actual };
        }
      }
    }

    expect(matched).toBeGreaterThan(100);
    // Roughly half of recent auctions are re-openings. If this ever falls to
    // zero the trap has gone away and this module can be simplified — but it
    // should be a deliberate decision, not a silent one.
    expect(misleading / matched).toBeGreaterThan(0.3);
    expect(worstCase!.label - worstCase!.actual).toBeGreaterThan(5);
  });

  it('buckets on remaining term, so a re-opened long bond joins the short comparables', () => {
    // A "15-year" bond re-opened with 5 years left. It must be comparable to
    // five-year paper and NOT to fifteen-year paper.
    const reopened = b({
      issueCode: 'FXD2/2013/015',
      tenorYears: 15,
      maturityDate: '2029-06-11',
      isin: 'reopened',
    });
    const genuine5 = b({ issueCode: 'FXD1/2024/005', tenorYears: 5, maturityDate: '2029-06-18', isin: 'g5' });
    const genuine15 = b({ issueCode: 'FXD1/2024/015', tenorYears: 15, maturityDate: '2039-06-13', isin: 'g15' });

    const at = '2024-06-17';
    const near = findComparables(
      [p({ issueCode: 'FXD2/2013/015', auctionDate: at, weightedAverageRate: 16 })],
      [reopened, genuine5, genuine15],
      5,
      1.5
    );
    expect(near.comparables).toHaveLength(1);
    expect(near.comparables[0].yearsToMaturity).toBeCloseTo(5, 1);

    const far = findComparables(
      [p({ issueCode: 'FXD2/2013/015', auctionDate: at, weightedAverageRate: 16 })],
      [reopened, genuine5, genuine15],
      15,
      1.5
    );
    expect(far.comparables).toHaveLength(0); // the label says 15; the bond is not
  });

  it('does not mix tax-exempt paper into taxable guidance', () => {
    const ifb = b({ issueCode: 'IFB1/2023/007', isin: 'ifb', taxExempt: true, maturityDate: '2031-06-16' });
    const fxd = b({ issueCode: 'FXD1/2024/007', isin: 'fxd', taxExempt: false, maturityDate: '2031-06-16' });
    const rows = [
      p({ issueCode: 'IFB1/2023/007', weightedAverageRate: 15.8 }),
      p({ issueCode: 'FXD1/2024/007', weightedAverageRate: 16.2 }),
    ];
    const taxable = findComparables(rows, [ifb, fxd], 7, 1.5, false);
    expect(taxable.comparables.map((c) => c.taxExempt)).toEqual([false]);
    const exempt = findComparables(rows, [ifb, fxd], 7, 1.5, true);
    expect(exempt.comparables.map((c) => c.taxExempt)).toEqual([true]);
  });
});

/* ------------------------------------------------------------------ trap 2 */

describe('TRAP 2: bid-to-cover cannot be computed per record', () => {
  /**
   * `amountOfferedKESM` is the whole auction's offer repeated on every bond in
   * it. The naive per-row ratio reads as a market in permanent collapse.
   */
  it('the per-record artefact is real, and grouping removes it', () => {
    let rows = 0;
    let perRecordSum = 0;
    for (const pr of prints) {
      if (!pr.auctionDate || pr.auctionDate < GUIDANCE_FROM) continue;
      if (typeof pr.amountOfferedKESM !== 'number' || !pr.amountOfferedKESM) continue;
      if (typeof pr.bidsReceivedKESM !== 'number') continue;
      rows++;
      perRecordSum += pr.bidsReceivedKESM / pr.amountOfferedKESM;
    }
    const naive = perRecordSum / rows;

    const grouped = demandByAuction(prints as AuctionPrint[]);
    const medianGrouped = [...grouped.map((d) => d.coverRatio)].sort((a, x) => a - x)[
      Math.floor(grouped.length / 2)
    ];

    expect(rows).toBeGreaterThan(50);
    expect(naive).toBeLessThan(1); // the artefact: looks undersubscribed
    expect(medianGrouped).toBeGreaterThan(1); // the truth: it is not
    // On the shipped archive: naive ~0.85x against a grouped median ~1.20x.
    expect(medianGrouped).toBeGreaterThan(naive * 1.3);
  });

  it('sums bids across an auction and takes the offer once', () => {
    const d = demandByAuction(
      [
        p({ auctionDate: '2024-06-17', amountOfferedKESM: 30_000, bidsReceivedKESM: 20_000, amountAcceptedKESM: 15_000 }),
        p({ auctionDate: '2024-06-17', amountOfferedKESM: 30_000, bidsReceivedKESM: 16_000, amountAcceptedKESM: 10_000 }),
      ],
      '2020'
    );
    expect(d).toHaveLength(1);
    expect(d[0].offeredKESM).toBe(30_000); // once, not 60,000
    expect(d[0].bidsKESM).toBe(36_000);
    expect(d[0].coverRatio).toBeCloseTo(1.2, 6);
    expect(d[0].acceptanceRate).toBeCloseTo(25_000 / 36_000, 6);
  });

  it('refuses an auction whose rows disagree about the amount offered', () => {
    // Two different offers on one date means our grouping assumption is wrong
    // for that auction. Say nothing rather than pick one.
    const d = demandByAuction(
      [
        p({ auctionDate: '2024-06-17', amountOfferedKESM: 30_000, bidsReceivedKESM: 20_000, amountAcceptedKESM: 15_000 }),
        p({ auctionDate: '2024-06-17', amountOfferedKESM: 25_000, bidsReceivedKESM: 16_000, amountAcceptedKESM: 10_000 }),
      ],
      '2020'
    );
    expect(d).toHaveLength(0);
  });

  it('describeDemand stays silent on fewer than three auctions', () => {
    expect(describeDemand([])).toBeNull();
    const d = demandByAuction(
      [p({ auctionDate: '2024-06-17', amountOfferedKESM: 10, bidsReceivedKESM: 20, amountAcceptedKESM: 5 })],
      '2020'
    );
    expect(describeDemand(d)).toBeNull();
  });
});

/* ------------------------------------------------------- the guidance itself */

describe('bidGuidance', () => {
  const spread = (rates: number[], maturity = '2034-06-12') =>
    rates.map((r, i) =>
      /* All inside one quarter on purpose. Guidance now prefers recent
       * comparables, so auctions spread across seven months would have the
       * oldest trimmed by the recency ladder — which is correct behaviour but
       * would make these quantile assertions test the window instead of the
       * quantiles. Recency gets its own test below. */
      p({ issueCode: `FXD${i}/2024/010`, auctionDate: `2024-07-0${(i % 9) + 1}`, weightedAverageRate: r })
    );
  const bondsFor = (n: number, maturity = '2034-06-12') =>
    Array.from({ length: n }, (_, i) => b({ issueCode: `FXD${i}/2024/010`, isin: `x${i}`, maturityDate: maturity }));

  it('reports the distribution of comparable clearing rates', () => {
    const rates = [12, 13, 14, 15, 16, 17, 18];
    const g = bidGuidance(spread(rates), bondsFor(rates.length), 10);
    expect(g.count).toBe(7);
    expect(g.low).toBe(12);
    expect(g.median).toBe(15);
    expect(g.high).toBe(18);
    expect(g.thin).toBe(false);
  });

  it('prefers recent comparables, and says how far back it looked', () => {
    /* Kenyan rates ran 16.7% in 2024 to 7.4% in early 2026, so four-year-old
     * auctions are partly evidence from a market that no longer exists.
     * Measured over the archive, preferring recent paper cut the midpoint's
     * median absolute error from 0.644pp to 0.616pp.
     *
     * The gain is modest and honestly so: a first, cruder experiment suggested
     * a third, and a like-for-like replay did not support it. */
    const old = Array.from({ length: 6 }, (_, i) =>
      p({ issueCode: `FXD${i}/2022/010`, auctionDate: `2022-0${i + 1}-10`, weightedAverageRate: 17 })
    );
    const recent = Array.from({ length: 6 }, (_, i) =>
      p({ issueCode: `FXD${i + 6}/2024/010`, auctionDate: `2024-07-0${i + 1}`, weightedAverageRate: 11 })
    );
    const allBonds = [
      ...Array.from({ length: 6 }, (_, i) =>
        b({ issueCode: `FXD${i}/2022/010`, isin: `o${i}`, maturityDate: '2034-06-12' })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        b({ issueCode: `FXD${i + 6}/2024/010`, isin: `r${i}`, maturityDate: '2034-06-12' })
      ),
    ];
    const g = bidGuidance([...old, ...recent], allBonds, 10);
    expect(g.median, 'the stale 17% auctions dragged the midpoint').toBe(11);
    expect(g.windowDays, 'the window used was not reported').toBe(180);
    expect(g.count).toBe(6);
  });

  it('looks further back rather than leaving a thin tenor unquotable', () => {
    /* A hard recency cut-off would silently stop answering for tenors that are
     * simply not auctioned often — the archive's most recent two-year print is
     * from 2024. Measured, the ladder cost nothing: 162 quotable auctions and
     * 24 thin ones, identical to no window at all. */
    const old = Array.from({ length: 6 }, (_, i) =>
      p({ issueCode: `FXD${i}/2022/010`, auctionDate: `2022-0${i + 1}-10`, weightedAverageRate: 17 })
    );
    const oneRecent = p({
      issueCode: 'FXD9/2024/010',
      auctionDate: '2024-07-01',
      weightedAverageRate: 11,
    });
    const allBonds = [
      ...Array.from({ length: 6 }, (_, i) =>
        b({ issueCode: `FXD${i}/2022/010`, isin: `o${i}`, maturityDate: '2034-06-12' })
      ),
      b({ issueCode: 'FXD9/2024/010', isin: 'r9', maturityDate: '2034-06-12' }),
    ];
    const g = bidGuidance([...old, oneRecent], allBonds, 10);
    expect(g.count, 'gave up instead of widening the window').toBeGreaterThanOrEqual(MIN_SAMPLE);
    expect(g.thin).toBe(false);
    expect(g.windowDays, 'a wider window was needed and should be reported').not.toBe(180);
  });

  it('widens the tolerance rather than quoting a range built on two auctions', () => {
    // Paper sitting 2.5 years off target: invisible at 1.5, found at 3.
    const off = Array.from({ length: 6 }, (_, i) =>
      b({ issueCode: `FXD${i}/2024/010`, isin: `y${i}`, maturityDate: '2036-12-12' })
    );
    const rows = Array.from({ length: 6 }, (_, i) =>
      p({ issueCode: `FXD${i}/2024/010`, auctionDate: `2024-0${i + 1}-17`, weightedAverageRate: 14 + i * 0.1 })
    );
    const g = bidGuidance(rows, off, 10);
    expect(g.toleranceYears).toBeGreaterThan(1.5);
    expect(g.count).toBeGreaterThanOrEqual(MIN_SAMPLE);
    expect(g.thin).toBe(false);
  });

  it('admits when the sample is too thin instead of implying a distribution', () => {
    const g = bidGuidance(spread([13, 14]), bondsFor(2), 10);
    expect(g.thin).toBe(true);
    const r = readBid(13.5, g);
    expect(r.verdict).toBe('unknown');
    expect(r.headline).toMatch(/not enough/i);
  });

  it('ignores everything before the guidance window', () => {
    const old = spread([12, 13, 14, 15, 16, 17]).map((row) => ({ ...row, auctionDate: '2019-06-17' }));
    const g = bidGuidance(old, bondsFor(6), 10);
    expect(g.count).toBe(0);
  });

  it('counts records it had to drop rather than hiding them', () => {
    const rows = [
      ...spread([12, 13, 14, 15, 16]),
      p({ issueCode: 'FXD9/2024/010', weightedAverageRate: undefined, marketWeightedAverageRate: undefined }),
    ];
    const g = bidGuidance(rows, bondsFor(5), 10);
    expect(g.droppedForMissingData).toBeGreaterThanOrEqual(1);
  });

  it('produces a usable ten-year distribution from the shipped archive', () => {
    const g = bidGuidance(prints as AuctionPrint[], bonds, 10, { taxExempt: false });
    expect(g.thin).toBe(false);
    /* Was >= 10 when guidance drew on the whole archive at once. It now
     * prefers recent paper, so a healthy answer is a SMALLER, fresher sample —
     * above MIN_SAMPLE and drawn from a stated window rather than from four
     * years of a market that has since moved. */
    expect(g.count).toBeGreaterThanOrEqual(MIN_SAMPLE);
    expect(g.windowDays, 'the whole archive was needed for a ten-year bond').not.toBeNull();
    // Kenyan government paper: sanity band, not a forecast.
    expect(g.median).toBeGreaterThan(8);
    expect(g.median).toBeLessThan(20);
    expect(g.low).toBeLessThanOrEqual(g.median);
    expect(g.median).toBeLessThanOrEqual(g.high);
    expect(g.latest).not.toBeNull();
  });
});

describe('readBid gets the direction right', () => {
  // In a CBK auction the bidder names a RATE. A LOW rate is the aggressive bid
  // that risks rejection; a HIGH rate is generous to the bidder but likely
  // filled. Getting this backwards would be confident, actionable, and wrong.
  const rates = [12, 13, 14, 15, 16, 17, 18];
  const g = bidGuidance(
    rates.map((r, i) => p({ issueCode: `FXD${i}/2024/010`, auctionDate: `2024-0${i + 1}-17`, weightedAverageRate: r })),
    Array.from({ length: 7 }, (_, i) => b({ issueCode: `FXD${i}/2024/010`, isin: `z${i}` })),
    10
  );

  it('calls a low rate aggressive and warns about rejection', () => {
    const r = readBid(12.2, g);
    expect(r.verdict).toBe('aggressive');
    expect(r.detail).toMatch(/rejected/i);
    expect(r.percentile).toBeLessThan(50);
  });

  it('calls a high rate generous and says the extra is given away', () => {
    const r = readBid(17.9, g);
    expect(r.verdict).toBe('generous');
    expect(r.detail).toMatch(/filled/i);
    expect(r.percentile).toBeGreaterThan(50);
  });

  it('calls a mid rate competitive', () => {
    expect(readBid(15, g).verdict).toBe('competitive');
  });

  it('percentile rises monotonically with the rate', () => {
    const lo = readBid(12.5, g).percentile;
    const mid = readBid(15.5, g).percentile;
    const hi = readBid(17.5, g).percentile;
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
  });
});

describe('yearsToMaturityAt', () => {
  it('uses the 364-day Kenyan year the rest of the engine uses', () => {
    const bond = b({ maturityDate: '2035-06-12' });
    const y = yearsToMaturityAt(bond, new Date('2025-06-12'));
    expect(y).toBeCloseTo(3653 / 364, 2);
  });

  it('goes negative once the bond has matured', () => {
    expect(yearsToMaturityAt(b({ maturityDate: '2020-01-01' }), new Date('2026-01-01'))).toBeLessThan(0);
  });
});
