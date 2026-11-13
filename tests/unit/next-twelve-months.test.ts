import { describe, expect, it } from 'vitest';
import type { Bond } from '../../src/types/bond';
import { nextTwelveMonthsNetCoupons } from '../../src/lib/portfolioCashFlows';

const TODAY = new Date('2026-11-13T09:00:00Z');

// The engine steps coupons in whole 182-day periods back from maturity (CBK's
// convention), so a test bond's issue date must sit on that grid or its dates
// would not be the ones the engine really produces for a Kenyan bond.
function mk(code: string, maturity: string): Bond {
  const issue = new Date(new Date(maturity).getTime() - 40 * 182 * 86_400_000).toISOString().slice(0, 10);
  return {
    isin: `KE-${code}`,
    issueCode: code,
    name: code,
    category: 'FXD',
    issueDate: issue,
    maturityDate: maturity,
    tenorYears: 10,
    couponRate: 12,
    couponFrequencyPerYear: 2,
    ytmGross: 13,
    minInvestmentKES: 50000,
    taxExempt: false,
    source: 'https://www.centralbank.go.ke/',
  } as Bond;
}

// A 12% semi-annual coupon on a face of 1,000,000, after 10% tax: 54,000 a period.
const NET_PER_PERIOD = 54_000;

describe('nextTwelveMonthsNetCoupons', () => {
  it('a bond with years left pays two coupons in the year: the run-rate is the truth', () => {
    const got = nextTwelveMonthsNetCoupons([{ bond: mk('LONG', '2031-01-07'), netCouponPerPeriodKES: NET_PER_PERIOD }], TODAY);
    expect(got).toBe(2 * NET_PER_PERIOD);
  });

  it('a bond maturing in four months pays ONE coupon, not a year of them', () => {
    // 15 Mar 2027 maturity: the 14 Sep 2026 coupon is past, the maturity-day coupon is the only one left.
    const got = nextTwelveMonthsNetCoupons([{ bond: mk('SOON', '2027-03-15'), netCouponPerPeriodKES: NET_PER_PERIOD }], TODAY);
    expect(got).toBe(NET_PER_PERIOD);
    expect(got).toBeLessThan(2 * NET_PER_PERIOD);
  });

  it('counts nothing for a bond that has already matured, and never invents income', () => {
    expect(nextTwelveMonthsNetCoupons([{ bond: mk('GONE', '2026-09-15'), netCouponPerPeriodKES: NET_PER_PERIOD }], TODAY)).toBe(0);
    expect(nextTwelveMonthsNetCoupons([], TODAY)).toBe(0);
  });

  it('adds holdings together', () => {
    const items = [
      { bond: mk('LONG', '2031-01-07'), netCouponPerPeriodKES: NET_PER_PERIOD },
      { bond: mk('SOON', '2027-03-15'), netCouponPerPeriodKES: NET_PER_PERIOD },
      { bond: mk('LONGER', '2031-01-07'), netCouponPerPeriodKES: NET_PER_PERIOD },
    ];
    const got = nextTwelveMonthsNetCoupons(items, TODAY);
    expect(got).toBe(5 * NET_PER_PERIOD);
    // Not asserted: that this stays at or under two coupons a bond. On a 182-day
    // cadence a twelve-month window occasionally holds three, and that is the
    // real cash, so the UI only speaks when the year falls SHORT of the run-rate.
  });

  it('does not count the principal: a repayment is not income', () => {
    // The function takes only a per-period coupon, so principal cannot enter it;
    // pinned by the SOON case above equalling exactly one coupon.
    const got = nextTwelveMonthsNetCoupons([{ bond: mk('SOON', '2027-03-15'), netCouponPerPeriodKES: NET_PER_PERIOD }], TODAY);
    expect(got).toBe(54_000);
  });
});
