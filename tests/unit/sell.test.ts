import { describe, it, expect } from 'vitest';
import { analyseSale, buildCashflows, remainingCouponDates, verdict, type SaleQuote } from '../../src/lib/sell';
import type { Bond } from '../../src/types/bond';

/**
 * Pinned to a REAL broker sheet — ABC Capital, 20 July 2026, IFB1/2022/18,
 * face KES 400,000. Fixtures that agree with the implementation by
 * construction prove nothing; this one was written by somebody else, priced by
 * somebody else, and every figure below is theirs.
 *
 *   Coupon 13.7420%   Issue 13-Jun-22   Maturity 21-May-40
 *   Last coupon 8-Jun-26   Next 7-Dec-26   Amortisation 02/06/31
 *   Value date 20-Jul-26   YTM 12.5000%
 *   Days accrued 42        Accrued 6,342.46
 *   Dirty 107.8145         Clean 106.2289    Consideration 431,258.00
 *   Commission 1,500.00    Levies 47.44
 */
const IFB: Bond = {
  isin: 'KE8000002322',
  issueCode: 'IFB1/2022/18',
  name: '18-Year Infrastructure Bond',
  category: 'IFB',
  issueDate: '2022-06-13',
  maturityDate: '2040-05-21',
  tenorYears: 18,
  couponRate: 13.742,
  couponFrequencyPerYear: 2,
  ytmGross: 13.742,
  minInvestmentKES: 50_000,
  taxExempt: true,
};

const QUOTE: SaleQuote = {
  faceValueKES: 400_000,
  settlementDate: '2026-07-20',
  dirtyPrice: 107.8145,
  quotedYTM: 12.5,
  commissionKES: 1_500,
  leviesKES: 47.44,
  // 50% of principal repaid on the stated amortisation date. Solved from the
  // sheet itself: it is the only fraction that reproduces 107.8145 at 12.50%.
  amortisation: [{ date: '2031-06-02', fraction: 0.5 }],
};

describe('the schedule matches the broker sheet', () => {
  it('steps 182 days and lands exactly on maturity', () => {
    const dates = remainingCouponDates(IFB, new Date('2026-07-20'));
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-12-07'); // sheet: next 7-Dec-26
    expect(dates[dates.length - 1].toISOString().slice(0, 10)).toBe('2040-05-21'); // = maturity
    expect(dates).toHaveLength(28);
  });

  /**
   * Every one of the 58 bonds we hold has a maturity that is an exact 182-day
   * multiple from issue, so a naive `while (d <= maturity)` loop happens to
   * produce the right schedule for all of them. That is luck, not correctness:
   * a bond with a stub period would lose the coupon paid AT redemption, and a
   * missing coupon makes selling look better than it is.
   *
   * This bond is deliberately not one of ours — maturity falls 100 days after
   * the last full period — so it fails if the schedule is ever re-derived
   * without the engine's redemption guard.
   */
  it('keeps the redemption coupon when maturity is not a whole number of periods', () => {
    const stub: Bond = { ...IFB, issueDate: '2022-06-13', maturityDate: '2040-08-29' };
    const dates = remainingCouponDates(stub, new Date('2026-07-20'));
    const last = dates[dates.length - 1].toISOString().slice(0, 10);
    expect(last).toBe('2040-08-29'); // redemption day itself, not the period before it
    const gapDays = Math.round(
      (dates[dates.length - 1].getTime() - dates[dates.length - 2].getTime()) / 86_400_000);
    expect(gapDays).toBeLessThan(182); // a genuine short final period, not dropped
  });

  it('prices the stub bond with that final coupon included', () => {
    const stub: Bond = { ...IFB, issueDate: '2022-06-13', maturityDate: '2040-08-29' };
    const cf = buildCashflows(stub, 400_000, new Date('2026-07-20'));
    const maturityRow = cf[cf.length - 1];
    expect(maturityRow.date).toBe('2040-08-29');
    expect(maturityRow.couponKES).toBeGreaterThan(0); // the coupon paid at redemption
    expect(maturityRow.principalKES).toBeCloseTo(400_000, 2);
  });
});

describe('analyseSale reproduces the broker sheet', () => {
  const a = analyseSale(IFB, QUOTE);

  it('accrues 42 days on the 182-day period', () => {
    expect(a.daysAccrued).toBe(42);
  });

  it('matches the accrued interest to the cent', () => {
    expect(a.accruedInterestKES).toBeCloseTo(6_342.46, 2);
    expect(a.accruedPer100).toBeCloseTo(1.5856, 4);
  });

  it('matches the clean price and the consideration', () => {
    expect(a.cleanPrice).toBeCloseTo(106.2289, 4);
    expect(a.considerationKES).toBeCloseTo(431_258.0, 2);
  });

  it('nets the charges off the consideration', () => {
    expect(a.totalChargesKES).toBeCloseTo(1_547.44, 2);
    expect(a.netProceedsKES).toBeCloseTo(429_710.56, 2);
  });

  it('reproduces the quoted 12.50% yield once amortisation is applied', () => {
    // This is the whole point: with the 50% repayment modelled, our price at
    // the broker's yield lands on the broker's price.
    expect(a.ourDirtyAtQuotedYTM).toBeCloseTo(107.8145, 2);
    expect(a.quoteDisagrees).toBe(false);
  });
});

describe('the numbers the sheet does not give you', () => {
  const a = analyseSale(IFB, QUOTE);

  it('the yield actually realised is worse than the quoted one', () => {
    // Charges come out of the proceeds, so the real sale yield is higher-priced
    // — i.e. a worse yield to the seller — than the sheet's headline.
    expect(a.effectiveSaleYield).toBeGreaterThan(12.5);
    expect(a.chargeDragPp).toBeGreaterThan(0);
    expect(a.chargeDragPp).toBeLessThan(0.5); // small, but not nothing
  });

  it('grosses the break-even up for a taxable replacement', () => {
    // IFB coupons are untaxed, so the net break-even IS the yield given up;
    // ordinary paper of this tenor loses 10% of its coupon to WHT.
    expect(a.whtRateOnReplacement).toBeCloseTo(0.1, 6);
    expect(a.breakEvenTaxableGrossYield).toBeCloseTo(a.breakEvenNetYield / 0.9, 6);
    expect(a.breakEvenTaxableGrossYield).toBeGreaterThan(a.breakEvenNetYield);
  });

  it('an IFB break-even is not reduced by tax', () => {
    // Tax-exempt: gross and net coupon streams are identical, so the net
    // break-even must equal the gross one.
    expect(a.breakEvenNetYield).toBeCloseTo(a.effectiveSaleYield, 6);
  });
});

describe('amortisation is not cosmetic', () => {
  it('ignoring it materially overprices the bond', () => {
    const withAmort = analyseSale(IFB, QUOTE);
    const without = analyseSale(IFB, { ...QUOTE, amortisation: [] });
    // Same quoted yield, very different price — 1.8 per 100 on this sheet,
    // about KES 7,300 on a KES 400,000 trade.
    const gap = (without.ourDirtyAtQuotedYTM ?? 0) - (withAmort.ourDirtyAtQuotedYTM ?? 0);
    expect(gap).toBeGreaterThan(1.5);
    expect(without.quoteDisagrees).toBe(true);
  });

  it('returns principal on the amortisation date and the rest at maturity', () => {
    const cf = buildCashflows(IFB, 400_000, new Date('2026-07-20'), QUOTE.amortisation);
    const principal = cf.reduce((s, c) => s + c.principalKES, 0);
    expect(principal).toBeCloseTo(400_000, 2); // all of it comes back, once
    const early = cf.filter((c) => c.principalKES > 0 && c.date < '2040-01-01');
    expect(early).toHaveLength(1);
    expect(early[0].principalKES).toBeCloseTo(200_000, 2);
  });

  it('pays later coupons on the reduced balance', () => {
    const cf = buildCashflows(IFB, 400_000, new Date('2026-07-20'), QUOTE.amortisation);
    const before = cf.find((c) => c.date < '2031-06-02')!;
    const after = cf.filter((c) => c.date > '2031-06-02' && c.couponKES > 0)[0];
    expect(before.couponKES).toBeCloseTo(27_484, 0);
    expect(after.couponKES).toBeCloseTo(13_742, 0); // half the balance, half the coupon
  });
});

describe('verdict', () => {
  const a = analyseSale(IFB, QUOTE);
  const FXD: Bond = { ...IFB, isin: 'X', issueCode: 'FXD1/2020/15', category: 'FXD', taxExempt: false };

  it('names the tax trap when swapping out of a tax-free bond', () => {
    const v = verdict(a, IFB, { bond: FXD, netYTM: 11.0, gapPp: -1, beatsBreakEven: false });
    expect(v).toMatch(/tax-free/i);
    expect(v).toMatch(/gross/);
    expect(v).toMatch(/costs you income/);
  });

  it('says plainly when a replacement does clear the bar', () => {
    const v = verdict(a, IFB, { bond: FXD, netYTM: 99, gapPp: 80, beatsBreakEven: true });
    expect(v).toMatch(/clears it/);
  });

  it('does not invent a comparison when there is nothing to compare', () => {
    expect(verdict(a, IFB, null)).toMatch(/compare against that figure/);
  });
});

/**
 * A yield annualised from under a year of remaining life is not a rate anyone
 * can go and buy.
 *
 * Found by driving the live page rather than by reading the code. The sell
 * page's default holding matures 62 days out; a 98.5 dirty price with a full
 * coupon still due produced "You are really selling at 46.61%. To stand still,
 * a taxable replacement must yield 51.79% gross."
 *
 * The arithmetic is correct — 46.61 / 0.9 = 51.79 — and the signal is real: at
 * that price the seller is giving value away. The INSTRUCTION is what fails.
 * No Kenyan instrument pays 51.79%; the market runs 8-16% and anything inside
 * a year is a Treasury bill near 9%. A reader who goes looking and finds
 * nothing may conclude the sale was fine, which inverts the warning.
 *
 * So the figures are still published and a caption carries the caveat. These
 * assertions hold the flag that drives it.
 */
describe('annualised yields on a nearly-matured bond', () => {
  const SHORT: Bond = { ...IFB, maturityDate: '2026-09-20' }; // 62 days from settlement

  it('flags a residual under a year as extrapolated', () => {
    const a = analyseSale(SHORT, QUOTE);
    expect(a.annualisationIsExtrapolated).toBe(true);
    expect(Math.round(a.yearsToMaturity * 365)).toBe(62);
  });

  /* The long bond is the control. If this also flagged, the caption would
   * appear on every sale and stop meaning anything. */
  it('does not flag a bond with years left to run', () => {
    const a = analyseSale(IFB, QUOTE);
    expect(a.annualisationIsExtrapolated).toBe(false);
    expect(a.yearsToMaturity).toBeGreaterThan(13);
  });

  /* Measured from SETTLEMENT, not from today. A sheet dated last month must be
   * judged on the life the bond had then, or the caption contradicts the
   * figures it is captioning — and this test would otherwise drift into
   * failure as the clock moves past the fixture. */
  it('measures the residual from the settlement date, not from now', () => {
    const later = analyseSale(SHORT, { ...QUOTE, settlementDate: '2026-09-01' });
    expect(Math.round(later.yearsToMaturity * 365)).toBe(19);
  });

  /* THE PREMISE, and it was wrong on the first attempt — worth recording.
   *
   * This originally asserted the short bond yields something enormous, on the
   * strength of the 46.61% seen on the live page. It failed: this fixture is a
   * PREMIUM sheet (107.81), and paying a premium for 62 days of life yields
   * almost nothing — 0.011%, not 46%.
   *
   * That is the same defect, not a counterexample. Annualising a two-month
   * horizon distorts in BOTH directions: a discount explodes and a premium
   * collapses, and "you are really selling at 0.01%" would mislead a reader
   * exactly as badly. So the property to hold is the DISTORTION, not its sign.
   *
   * Identical price and charges, identical everything but remaining life: if
   * the annualised figures barely moved, the caption would be guarding nothing.
   */
  it('distorts the annualised yield purely through the shortened horizon', () => {
    const short = analyseSale(SHORT, QUOTE);
    const long = analyseSale(IFB, QUOTE);
    const ratio = long.effectiveSaleYield / Math.max(short.effectiveSaleYield, 1e-9);
    expect(
      ratio,
      'the same sheet on a shorter bond must produce a materially different ' +
        'annualised yield, or there is nothing for the caption to warn about'
    ).toBeGreaterThan(50);
  });
});
