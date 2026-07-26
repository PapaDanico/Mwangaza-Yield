import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import bondsData from '../../public/data/bonds.json';
import {
  IN_LINE_BPS,
  MIN_PEERS,
  benchmarkQuote,
} from '../../src/lib/quote-benchmark';
import { computeBondInvestment } from '../../src/lib/financial-engine';
import type { AuctionPrint, Bond } from '../../src/types/bond';

/**
 * Benchmarking a broker's quote against the primary market.
 *
 * Four things have to match or the comparison is noise — gross against gross,
 * tax status, remaining term rather than the tenor label, and recency. Each is
 * pinned below, because each has a plausible-looking wrong answer that would
 * ship silently.
 */

const prints = archive as unknown as AuctionPrint[];
const bonds = bondsData as unknown as Bond[];
const ASOF = new Date('2026-07-26');

const live = bonds
  .filter((b) => new Date(b.maturityDate) > ASOF)
  .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

/** A bond the shipped archive can actually benchmark, for the happy path. */
const quotable = live.find(
  (b) => benchmarkQuote(b, 100, prints, bonds, ASOF).verdict !== 'unknown',
)!;

describe('the comparison is like-for-like', () => {
  it('finds a benchmarkable bond in the shipped data at all', () => {
    expect(quotable).toBeDefined();
  });

  it('compares gross to gross, never net to gross', () => {
    // Clearing rates are pre-tax. If the implied yield were ever the NET one,
    // every taxable bond would look far cheaper than it is — by roughly the
    // whole withholding rate.
    const b = benchmarkQuote(quotable, 100, prints, bonds, ASOF);
    const r = computeBondInvestment(quotable, 100_000, 100, ASOF);
    expect(b.impliedGrossYTM).toBeCloseTo(r.grossYTM, 6);
    if (!quotable.taxExempt) {
      expect(b.impliedGrossYTM).toBeGreaterThan(r.netYTM);
    }
  });

  it('never benchmarks a bond against the other tax status', () => {
    // Measured on the live archive: an IFB priced at par reads +509bps against
    // a blended pool. That is the tax exemption, not an opportunity.
    //
    // The teeth: take a real bond and a synthetic twin identical in every way
    // EXCEPT its tax status. If the filter were dropped they would draw the
    // same peer pool and agree. They must not.
    const real = live.find((b) => {
      const r = benchmarkQuote(b, 100, prints, bonds, ASOF);
      const twin: Bond = { ...b, isin: b.isin + '-TWIN', taxExempt: !b.taxExempt };
      const t = benchmarkQuote(twin, 100, prints, bonds, ASOF);
      return r.verdict !== 'unknown' && t.verdict !== 'unknown';
    });
    expect(real, 'need one bond benchmarkable under both tax statuses').toBeDefined();

    const asIs = benchmarkQuote(real!, 100, prints, bonds, ASOF);
    const flipped = benchmarkQuote(
      { ...real!, isin: real!.isin + '-TWIN', taxExempt: !real!.taxExempt },
      100,
      prints,
      bonds,
      ASOF,
    );
    // Same maturity, same price — different pool, so a different benchmark.
    expect(flipped.peerMedian).not.toBeCloseTo(asIs.peerMedian!, 6);
  });

  it('states how far the term band had to widen', () => {
    const r = benchmarkQuote(quotable, 100, prints, bonds, ASOF);
    expect([1.5, 3, 5]).toContain(r.toleranceYears);
  });
});

describe('the verdict follows the price, monotonically', () => {
  it('a higher price means a lower yield and a worse verdict', () => {
    const cheap = benchmarkQuote(quotable, 85, prints, bonds, ASOF);
    const dear = benchmarkQuote(quotable, 115, prints, bonds, ASOF);
    expect(cheap.impliedGrossYTM).toBeGreaterThan(dear.impliedGrossYTM);
    expect(cheap.gapBps!).toBeGreaterThan(dear.gapBps!);
  });

  it('calls a very low price rich and a very high price poor', () => {
    expect(benchmarkQuote(quotable, 60, prints, bonds, ASOF).verdict).toBe('above');
    expect(benchmarkQuote(quotable, 150, prints, bonds, ASOF).verdict).toBe('below');
  });

  it('treats a small difference as ordinary rather than a signal', () => {
    // Find the price that lands exactly on the peer median, then nudge it.
    const base = benchmarkQuote(quotable, 100, prints, bonds, ASOF);
    expect(base.peerMedian).not.toBeNull();
    let atPar = 100;
    for (let p = 60; p <= 160; p += 0.25) {
      const r = benchmarkQuote(quotable, p, prints, bonds, ASOF);
      if (Math.abs(r.gapBps!) <= IN_LINE_BPS) { atPar = p; break; }
    }
    expect(benchmarkQuote(quotable, atPar, prints, bonds, ASOF).verdict).toBe('in-line');
  });

  it('reports the gap in basis points, consistent with the two yields', () => {
    const r = benchmarkQuote(quotable, 97, prints, bonds, ASOF);
    expect(r.gapBps).toBe(Math.round((r.impliedGrossYTM - r.peerMedian!) * 100));
  });
});

describe('it refuses rather than guesses', () => {
  it('says nothing when the comparable sample is too thin', () => {
    const thin = live.find(
      (b) => benchmarkQuote(b, 100, prints, bonds, ASOF).verdict === 'unknown',
    );
    // Half the universe is in this state on the shipped archive — CBK has not
    // auctioned many IFBs lately, nor much short paper.
    expect(thin).toBeDefined();
    const r = benchmarkQuote(thin!, 100, prints, bonds, ASOF);
    expect(r.peerMedian).toBeNull();
    expect(r.gapBps).toBeNull();
    expect(r.peerCount).toBeLessThan(MIN_PEERS);
    expect(r.summary).toMatch(/[Nn]ot enough comparable auctions/);
  });

  it('still solves the implied yield even when it cannot benchmark it', () => {
    // The reader's own number is always worth showing; only the comparison
    // is withheld.
    const thin = live.find(
      (b) => benchmarkQuote(b, 100, prints, bonds, ASOF).verdict === 'unknown',
    )!;
    const r = benchmarkQuote(thin, 100, prints, bonds, ASOF);
    expect(r.impliedGrossYTM).toBeGreaterThan(0);
    expect(Number.isFinite(r.impliedGrossYTM)).toBe(true);
  });

  it('never quotes a median built on fewer than the minimum', () => {
    for (const bond of live) {
      const r = benchmarkQuote(bond, 100, prints, bonds, ASOF);
      if (r.peerMedian !== null) expect(r.peerCount).toBeGreaterThanOrEqual(MIN_PEERS);
      else expect(r.verdict).toBe('unknown');
    }
  });
});

describe('the summary is safe to render', () => {
  it('never promises the quote is good or bad, only how it compares', () => {
    const r = benchmarkQuote(quotable, 90, prints, bonds, ASOF);
    expect(r.summary).not.toMatch(/\bshould buy\b|\bgood investment\b|\brecommend/i);
    expect(r.summary).toMatch(/clearing|paying|comparable/i);
  });

  it('names the sample it rests on', () => {
    const r = benchmarkQuote(quotable, 90, prints, bonds, ASOF);
    expect(r.summary).toMatch(new RegExp(`${r.peerCount} auction`));
    expect(r.summary).toMatch(/past 12 months/);
  });

  it('says outright when a lower yield is not automatically a bad trade', () => {
    const r = benchmarkQuote(quotable, 150, prints, bonds, ASOF);
    expect(r.verdict).toBe('below');
    expect(r.summary).toMatch(/not necessarily a bad trade/i);
  });
});

describe('coverage on the shipped archive', () => {
  it('benchmarks a useful share of the universe, and admits the rest', () => {
    let covered = 0;
    for (const b of live) {
      if (benchmarkQuote(b, 100, prints, bonds, ASOF).verdict !== 'unknown') covered++;
    }
    // Measured at 29 of 58. This is a floor, not a target: if it collapses,
    // the archive has thinned and the feature should be reconsidered rather
    // than quietly widened until it says something.
    expect(covered).toBeGreaterThanOrEqual(15);
    expect(covered).toBeLessThanOrEqual(live.length);
  });
});
