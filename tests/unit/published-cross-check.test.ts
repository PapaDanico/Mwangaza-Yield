import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import published from '../fixtures/published-auctions.json';
import type { AuctionPrint } from '../../src/types/bond';

/**
 * Check the parse against the outside world, not against itself.
 *
 * Every other test here reads the same archive the parser produced, so a
 * systematic misread has nothing to collide with — the data agrees with itself
 * all the way to a wrong answer. That is exactly what happened: a bid-to-cover
 * built on a partial numerator reported Kenyan auctions as persistently
 * undersubscribed when the published record says the opposite, and 24 passing
 * tests raised no objection because all of them read the same numbers.
 *
 * WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ----------------------------------------------------
 * It fails when a figure we DO have disagrees with what was reported. It stays
 * silent where we have nothing: a gap is a known and published limitation, not
 * a wrong answer, and demanding a value here would push someone toward filling
 * it from a newspaper. Nothing in this fixture is ever ingested. A figure we
 * cannot read from CBK's own PDF stays missing.
 */
const PRINTS = archive as unknown as AuctionPrint[];
const BN = 1_000; // records are KES millions; the press reports billions
const TOL = 0.05; // 50 million, comfortably inside rounding to one decimal

interface PublishedBond {
  issueCode: string;
  bidsBn?: number;
  acceptedBn?: number;
  performancePct?: number;
  bidToCover?: number;
}
interface PublishedAuction {
  auctionDate: string;
  source: string;
  advertisedTargetBn?: number;
  totalBidsBn?: number;
  bonds: PublishedBond[];
}

const AUCTIONS = (published as unknown as { auctions: PublishedAuction[] }).auctions;
const rowsFor = (date: string) => PRINTS.filter((p) => p.auctionDate?.slice(0, 10) === date);

describe('our parse against independently published figures', () => {
  it('has auctions to check', () => expect(AUCTIONS.length).toBeGreaterThan(0));

  for (const a of AUCTIONS) {
    describe(`${a.auctionDate} (${a.source})`, () => {
      const rows = rowsFor(a.auctionDate);

      it('appears in the archive at all', () => {
        // If this fails the auction was dropped, which is worth knowing even
        // though every field below would then be vacuously skipped.
        expect(rows.length).toBeGreaterThan(0);
      });

      if (a.advertisedTargetBn !== undefined) {
        it(`records the advertised target as ${a.advertisedTargetBn}bn where it has one`, () => {
          const offered = rows.map((r) => r.amountOfferedKESM).filter((v): v is number => !!v);
          if (!offered.length) return; // a gap, not a disagreement
          for (const v of offered) {
            expect(Math.abs(v / BN - a.advertisedTargetBn!)).toBeLessThan(TOL);
          }
        });
      }

      for (const b of a.bonds) {
        const row = rows.find((r) => r.issueCode === b.issueCode);

        if (b.bidsBn !== undefined) {
          it(`${b.issueCode} bids agree (${b.bidsBn}bn)`, () => {
            if (!row?.bidsReceivedKESM) return;
            expect(Math.abs(row.bidsReceivedKESM / BN - b.bidsBn!)).toBeLessThan(TOL);
          });
        }

        if (b.acceptedBn !== undefined) {
          it(`${b.issueCode} accepted agrees (${b.acceptedBn}bn)`, () => {
            if (!row?.amountAcceptedKESM) return;
            expect(Math.abs(row.amountAcceptedKESM / BN - b.acceptedBn!)).toBeLessThan(TOL);
          });
        }
      }
    });
  }
});

describe('what the published figures settle about scope', () => {
  // These are arithmetic facts about the reported numbers, independent of our
  // parse. They are asserted here because the whole auction-review module rests
  // on them, and because getting them wrong is what produced a false finding.
  const feb = AUCTIONS.find((a) => a.auctionDate === '2026-02-16')!;

  it('bids are PER BOND — the legs sum to the reported auction total', () => {
    const sum = feb.bonds.reduce((s, b) => s + (b.bidsBn ?? 0), 0);
    expect(Math.abs(sum - feb.totalBidsBn!)).toBeLessThan(0.1);
  });

  it('offered is AUCTION-LEVEL — every leg is rated against the same target', () => {
    // 133.8/50 = 267.6% and 79.9/50 = 159.8%, both as reported. If the target
    // were per bond these would not reconcile against a single 50bn.
    for (const b of feb.bonds) {
      if (b.performancePct === undefined || b.bidsBn === undefined) continue;
      const implied = (b.bidsBn / feb.advertisedTargetBn!) * 100;
      expect(Math.abs(implied - b.performancePct)).toBeLessThan(0.5);
    }
  });

  it('cover is therefore the SUM of per-bond bids over the auction target', () => {
    // The formula auction-review.ts implements, and the reason its
    // `bidsComplete` guard refuses a ratio until every leg carries its bids.
    const cover = feb.totalBidsBn! / feb.advertisedTargetBn!;
    expect(cover).toBeCloseTo(4.274, 2);
    expect(cover).toBeGreaterThan(1); // oversubscribed, as the record says
  });
});
