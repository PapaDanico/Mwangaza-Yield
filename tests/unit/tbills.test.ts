import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeTBill, tbillPricePer100, projectRollover, bestTBill, TBILL_WHT_RATE } from '../../src/lib/tbills';
import type { TBill } from '../../src/types/bond';

// Reference case: the 16 Jul 2026 CBK auction, 91-day at 8.7986%.
const R91 = computeTBill(100_000, 8.7986, 91);

/**
 * CBK prints the answer, so the answer is what we check against.
 *
 * Every T-bill results release carries a line we had been reading past —
 * "Price per Kshs 100 at average interest rate" — which is CBK stating the
 * settlement price for the rate it just published. That makes the convention
 * question decidable rather than arguable, and it decided against us: this
 * module priced on a BANK discount basis (quote is a discount on face) when
 * CBK prices on a TRUE discount basis (quote is a yield on the price paid).
 *
 * These are the three tenors of the 03/08/2026 auction, issues 2693/091,
 * 2667/182 and 2622/364, at the weighted average rate of accepted bids. They
 * are kept as literals from the source document rather than derived, because a
 * fixture computed by the code it verifies checks nothing.
 */
const CBK_030826 = [
  { tenorDays: 91, rate: 8.7882, pricePer100: 97.8559 },
  { tenorDays: 182, rate: 8.9545, pricePer100: 95.7259 },
  { tenorDays: 364, rate: 9.0169, pricePer100: 91.7497 },
];

describe('tbillPricePer100 against CBK’s own published prices', () => {
  for (const { tenorDays, rate, pricePer100 } of CBK_030826) {
    it(`reproduces the ${tenorDays}-day price CBK printed`, () => {
      expect(tbillPricePer100(rate, tenorDays)).toBeCloseTo(pricePer100, 4);
    });
  }

  it('is not the bank-discount formula, which misses by up to Ksh 0.74', () => {
    /* Asserted explicitly because the two agree closely at short tenors and it
     * would be easy to "fix" this back. At 91 days the gap is under 5 cents,
     * which is why the defect survived; at 364 days it is nearly 74, and the
     * yield it implies is 84 basis points too high. The old formula is named
     * here so that reverting to it fails rather than merely drifting. */
    for (const { tenorDays, rate, pricePer100 } of CBK_030826) {
      const bankDiscount = 100 - (rate * tenorDays) / 365;
      expect(bankDiscount, `bank discount happens to match CBK at ${tenorDays}d`).not.toBeCloseTo(
        pricePer100,
        3
      );
    }
    expect(100 - (9.0169 * 364) / 365).toBeCloseTo(91.0078, 3);
  });

  it('never prices a bill at or above par', () => {
    // A discount instrument priced at 100 or more is arbitrage, not a bill.
    for (const days of [91, 182, 364]) {
      for (const r of [0.5, 9, 25]) {
        expect(tbillPricePer100(r, days)).toBeLessThan(100);
        expect(tbillPricePer100(r, days)).toBeGreaterThan(0);
      }
    }
  });
});

describe('computeTBill', () => {
  it('cost is face less the discount', () => {
    expect(R91.costKES).toBeCloseTo(97_853.5, 0);
    expect(R91.grossInterestKES).toBeCloseTo(2_146.5, 0);
    expect(R91.costKES + R91.grossInterestKES).toBeCloseTo(100_000, 6);
  });

  it('applies 15% WHT to the interest, never the principal', () => {
    expect(R91.whtKES).toBeCloseTo(R91.grossInterestKES * TBILL_WHT_RATE, 6);
    expect(R91.netProceedsKES).toBeCloseTo(R91.costKES + R91.netInterestKES, 6);
    expect(R91.netProceedsKES).toBeLessThan(100_000);
  });

  it('effective yield EXCEEDS the quoted discount rate — the headline gap', () => {
    expect(R91.grossEAY).toBeGreaterThan(8.7986);
    expect(R91.grossEAY).toBeCloseTo(9.09, 1);
    expect(R91.quoteGapBps).toBeGreaterThan(0);
  });

  it('net yield falls below the quoted rate once WHT bites', () => {
    expect(R91.netEAY).toBeLessThan(8.7986);
    expect(R91.netEAY).toBeCloseTo(7.69, 1);
    expect(R91.taxDragBps).toBeGreaterThan(100);
  });

  it('the quote-to-yield gap NARROWS with tenor, vanishing at a year', () => {
    /* This test used to assert the opposite, under the heading "counter-
     * intuitive but correct", and the reasoning read well: a 364-day bill
     * prices near 91 while a 91-day prices near 98, so the same discount is
     * earned on a much smaller outlay. It was an artefact of the bank-discount
     * formula, and the fact that it needed a paragraph arguing against
     * intuition should have been the tell.
     *
     * On CBK's actual convention the quote is already a simple annual yield,
     * so the only thing the effective yield adds is compounding — and you can
     * only compound what you can reinvest. A 91-day bill rolls four times a
     * year and picks up 29 basis points doing it. A 364-day bill rolls once,
     * has nothing to reinvest, and its effective yield lands within a
     * hundredth of a point of the rate CBK quoted. The gap is the value of
     * rolling over, so it shrinks as the tenor approaches the year. */
    const r364 = computeTBill(100_000, 9.0415, 364);
    const r182 = computeTBill(100_000, 8.9695, 182);
    expect(r364.pricePer100).toBeLessThan(R91.pricePer100);
    expect(r364.quoteGapBps).toBeLessThan(r182.quoteGapBps);
    expect(r182.quoteGapBps).toBeLessThan(R91.quoteGapBps);
    expect(r364.quoteGapBps).toBeLessThan(1);
    expect(r364.grossEAY).toBeCloseTo(9.04, 1);
  });
});

describe('projectRollover', () => {
  it('rolls a 91-day bill four times in a year and compounds', () => {
    const p = projectRollover(1_000_000, 8.7986, 91, 12);
    expect(p.cycles).toBe(4);
    expect(p.schedule).toHaveLength(4);
    expect(p.finalValueKES).toBeGreaterThan(1_000_000);
    // Each cycle starts from the previous cycle's net proceeds.
    expect(p.schedule[1].startKES).toBeCloseTo(p.schedule[0].endKES, 6);
    expect(p.netAnnualisedYield).toBeCloseTo(computeTBill(100_000, 8.7986, 91).netEAY, 1);
  });

  it('never returns zero cycles for a short horizon', () => {
    expect(projectRollover(500_000, 9.0415, 364, 3).cycles).toBe(1);
  });
});

describe('bestTBill', () => {
  const bills: TBill[] = [
    { id: 'a', tenorDays: 91, discountRate: 8.7986, auctionDate: '2026-07-16', nextAuctionDate: '2026-07-30', amountOfferedKES: 0, amountAcceptedKES: 0, minInvestmentKES: 100_000, source: 'x' },
    { id: 'b', tenorDays: 364, discountRate: 9.0415, auctionDate: '2026-07-16', nextAuctionDate: '2026-07-30', amountOfferedKES: 0, amountAcceptedKES: 0, minInvestmentKES: 100_000, source: 'x' },
  ];
  it('ranks by net effective yield, not the quoted rate', () => {
    const best = bestTBill(bills)!;
    expect(best.result.netEAY).toBeGreaterThanOrEqual(
      computeTBill(100_000, 9.0415, 364).netEAY
    );
  });
  it('returns null with no bills', () => expect(bestTBill([])).toBeNull());
});

describe('a yield is a rate, not an amount', () => {
  it('survives an empty amount box', () => {
    // Number('') is 0, which the number input invites on every clear. Deriving
    // the yields from costKES made that 0/0 and put "NaN%" on the page as the
    // headline "what you actually earn" figure.
    const r = computeTBill(0, 9.5, 91);
    expect(Number.isFinite(r.grossEAY)).toBe(true);
    expect(Number.isFinite(r.netEAY)).toBe(true);
    expect(Number.isFinite(r.taxDragBps)).toBe(true);
    expect(Number.isFinite(r.quoteGapBps)).toBe(true);
    expect(r.netEAY).toBeGreaterThan(0);
  });

  it('reports the same yield whatever the amount', () => {
    const small = computeTBill(1, 9.5, 91);
    const large = computeTBill(50_000_000, 9.5, 91);
    expect(small.grossEAY).toBeCloseTo(large.grossEAY, 10);
    expect(small.netEAY).toBeCloseTo(large.netEAY, 10);
  });

  it('still nets below gross, and both above the quoted rate', () => {
    const r = computeTBill(1_000_000, 9.5, 364);
    expect(r.netEAY).toBeLessThan(r.grossEAY);
    expect(r.grossEAY).toBeGreaterThan(r.discountRate);
  });
});

/**
 * The same false claim was in the shipped copy, not only in a test.
 *
 * The bank-discount formula produced a genuinely odd consequence — that the
 * quote-to-yield gap grows with tenor — and it was written down three times:
 * in a unit test, in the glossary's discount-rate entry, and in a paragraph on
 * /learn that walked a reader through it with worked numbers. Fixing the
 * arithmetic silently would have left two of the three still telling readers
 * the opposite of what the tool computes.
 *
 * Found by sweeping for the sentence after the formula was corrected, which is
 * the general lesson: a wrong model does not live only in the code that
 * implements it.
 */
describe('the pages agree with the engine about which way the gap runs', () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

  it('does not tell readers the gap widens with tenor', () => {
    for (const f of ['src/lib/glossary.ts', 'src/app/learn/page.tsx']) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, ' ');
      expect(src, `${f} still says the quote-to-yield gap grows with tenor`).not.toMatch(
        /gap\s+(?:<strong>)?widens/i
      );
    }
  });

  it('quotes figures the engine actually produces', () => {
    /* The learn page walks through a worked example, and a worked example with
     * stale numbers is worse than none — a reader can check it, which is the
     * entire point of putting it there. */
    const page = read('src/app/learn/page.tsx');
    const r = computeTBill(100_000, 8.7882, 91);
    expect(page).toContain(r.pricePer100.toFixed(2));
    expect(page).toContain(r.grossEAY.toFixed(2));
    expect(page).toContain(r.netEAY.toFixed(2));
  });
});
