import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeTBill, TBILL_WHT_RATE } from '../../src/lib/tbills';
import tbillsData from '../../public/data/tbills.json';

/**
 * The feed is a published contract: another product reads these fields and
 * shows the numbers to somebody deciding where to put money. So the tests
 * that matter are not "does it parse" but "is the figure right, and is it
 * still the figure it claims to be".
 *
 * The specific error this feed exists to prevent — treating CBK's quoted
 * discount rate as a return — is pinned below, because a regression there
 * would be silent, plausible, and roughly a percentage point wrong.
 */

interface Feed {
  schema: number;
  generatedAt: string;
  notes: Record<string, string>;
  tbills: Array<{
    tenorDays: number;
    quotedDiscountRate: number;
    grossEAY: number;
    netEAY: number;
    whtRate: number;
    pricePer100: number;
    auctionDate: string;
  }>;
  macro: Record<string, { value: number; unit: string; date: string } | null>;
  bondAuctionBenchmarks: {
    windowDays: number;
    minSample: number;
    bands: Array<{
      label: string;
      auctions: number;
      medianClearingRate: number | null;
      lowClearingRate: number | null;
      highClearingRate: number | null;
    }>;
    demand: { auctions: number; medianCoverRatio: number; medianAcceptanceRate: number } | null;
  };
}

const feed = JSON.parse(readFileSync('public/data/rates.json', 'utf8')) as Feed;
const bills = tbillsData as Array<{ tenorDays: number; discountRate: number }>;

describe('the feed is a stable contract', () => {
  it('declares a schema version consumers can refuse', () => {
    expect(feed.schema).toBe(1);
  });

  it('carries its caveats inside the file, not just in the docs', () => {
    // A figure that outlives its caveats is how a careful calculation becomes
    // a careless claim downstream.
    for (const key of ['sourcing', 'tbills', 'conventions', 'benchmarks', 'warranty', 'attribution']) {
      expect(feed.notes[key], `notes.${key}`).toBeTruthy();
    }
    expect(feed.notes.tbills).toMatch(/NOT a return/);
  });

  it('publishes no exchange-derived prices, and says so', () => {
    expect(feed.notes.sourcing).toMatch(/No exchange-sourced/i);
    expect(JSON.stringify(feed)).not.toMatch(/nse\.co\.ke/i);
  });
});

describe('the T-bill figures are the engine\'s, not a rounded quote', () => {
  it('reproduces the engine exactly for every published tenor', () => {
    expect(feed.tbills).toHaveLength(bills.length);
    for (const row of feed.tbills) {
      const src = bills.find((b) => b.tenorDays === row.tenorDays)!;
      const r = computeTBill(100, src.discountRate, row.tenorDays);
      expect(row.quotedDiscountRate).toBeCloseTo(src.discountRate, 4);
      expect(row.grossEAY).toBeCloseTo(r.grossEAY, 3);
      expect(row.netEAY).toBeCloseTo(r.netEAY, 3);
      expect(row.pricePer100).toBeCloseTo(r.pricePer100, 3);
      expect(row.whtRate).toBe(TBILL_WHT_RATE);
    }
  });

  /**
   * THE ERROR THIS FEED EXISTS TO PREVENT.
   *
   * A consumer who multiplies capital by the quoted rate is wrong twice in
   * opposite directions: the discount is earned on a smaller outlay (so the
   * gross yield is HIGHER than quoted) and 15% tax then applies (so the net
   * is LOWER). Measured on the shipped data, the quote sits about 0.9pp above
   * the net — our sister product was making exactly this error.
   */
  it('keeps the three rates in the order that makes the trap visible', () => {
    for (const row of feed.tbills) {
      expect(row.grossEAY, `${row.tenorDays}d gross > quoted`).toBeGreaterThan(row.quotedDiscountRate);
      expect(row.netEAY, `${row.tenorDays}d net < gross`).toBeLessThan(row.grossEAY);
      expect(row.netEAY, `${row.tenorDays}d net < quoted`).toBeLessThan(row.quotedDiscountRate);
    }
  });

  it('the quoted-vs-net gap is material enough to be worth publishing', () => {
    const gaps = feed.tbills.map((r) => r.quotedDiscountRate - r.netEAY);
    for (const g of gaps) expect(g).toBeGreaterThan(0.5); // percentage points
  });

  it('prices are plausible discounts, ordered by tenor', () => {
    for (const row of feed.tbills) {
      expect(row.pricePer100).toBeGreaterThan(80);
      expect(row.pricePer100).toBeLessThan(100);
    }
    const tenors = feed.tbills.map((r) => r.tenorDays);
    expect([...tenors].sort((a, b) => a - b)).toEqual(tenors);
  });
});

describe('macro and benchmarks are quoted only where evidence exists', () => {
  it('carries the Central Bank Rate with its date', () => {
    const cbr = feed.macro.centralBankRate!;
    expect(cbr).not.toBeNull();
    expect(cbr.value).toBeGreaterThan(0);
    expect(cbr.value).toBeLessThan(30);
    expect(cbr.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('quotes a band median only when the sample clears the minimum', () => {
    const { bands, minSample } = feed.bondAuctionBenchmarks;
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      if (band.medianClearingRate === null) {
        expect(band.auctions).toBeLessThan(minSample);
      } else {
        expect(band.auctions).toBeGreaterThanOrEqual(minSample);
        expect(band.lowClearingRate!).toBeLessThanOrEqual(band.medianClearingRate);
        expect(band.medianClearingRate).toBeLessThanOrEqual(band.highClearingRate!);
        expect(band.medianClearingRate).toBeGreaterThan(5);
        expect(band.medianClearingRate).toBeLessThan(25);
      }
    }
  });

  it('at least one band is quotable, or the feed has nothing to say', () => {
    const quotable = feed.bondAuctionBenchmarks.bands.filter((b) => b.medianClearingRate !== null);
    expect(quotable.length).toBeGreaterThanOrEqual(2);
  });

  it('reports demand grouped per auction, in a plausible range', () => {
    const d = feed.bondAuctionBenchmarks.demand!;
    expect(d).not.toBeNull();
    // The per-record artefact this project documents reads ~0.6x; grouped
    // truth is above 1. A feed publishing the artefact would be worse than
    // publishing nothing.
    expect(d.medianCoverRatio).toBeGreaterThan(0.8);
    expect(d.medianCoverRatio).toBeLessThan(10);
    expect(d.medianAcceptanceRate).toBeGreaterThan(0);
    expect(d.medianAcceptanceRate).toBeLessThanOrEqual(1);
  });
});

describe('the feed dates its evidence', () => {
  it('stamps when the underlying data was refreshed', () => {
    expect(feed.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('every T-bill row names the auction it came from', () => {
    for (const row of feed.tbills) {
      expect(row.auctionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
