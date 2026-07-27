import { describe, it, expect } from 'vitest';
import auctionsData from '../../public/data/auction-results.json';
import bondsData from '../../public/data/bonds.json';
import type { AuctionPrint, Bond } from '../../src/types/bond';
import {
  approximateMaturity,
  availabilityForTerm,
  bandFor,
  reinvestmentAvailability,
  MATURITY_APPROXIMATION_MAX_ERROR_DAYS,
  MIN_AUCTIONS_FOR_A_CLAIM,
  TERM_BANDS,
} from '../../src/lib/reinvestment';

const PRINTS = auctionsData as unknown as AuctionPrint[];
const BONDS = bondsData as unknown as Bond[];

describe('approximate maturity from the issue code', () => {
  it('reads the issue year and tenor', () => {
    expect(approximateMaturity('FXD1/2023/005')?.getUTCFullYear()).toBe(2028);
    expect(approximateMaturity('IFB1/2017/012')?.getUTCFullYear()).toBe(2029);
  });

  it('handles the fractional tenors CBK actually issued', () => {
    // IFB1/2023/6.5 and IFB1/2024/8.5 exist. A \d+ pattern reads those as 6
    // and 8, moving two tax-free bonds into the wrong band — the same trap
    // auction-history.ts documents for its own regex.
    // Mid-2023 plus six and a half years lands in January 2030, not 2029 —
    // the half-year carries past the year boundary. My first version of this
    // assertion said 2029 and the implementation was right.
    const half = approximateMaturity('IFB1/2023/6.5');
    expect(half).not.toBeNull();
    expect(half!.getUTCFullYear()).toBe(2030);
    expect(half!.getUTCMonth()).toBe(0);

    // And it must NOT collapse to the whole-year bond, which is the trap.
    const whole = approximateMaturity('IFB1/2023/006');
    expect(half!.getTime()).not.toBe(whole!.getTime());
  });

  it('returns null rather than guessing at an unrecognised code', () => {
    expect(approximateMaturity('NOT-A-CODE')).toBeNull();
    expect(approximateMaturity('')).toBeNull();
  });

  /**
   * The approximation is only honest if its error is known.
   *
   * Checked against every bond that carries both a code and a real maturity
   * date. If a future issuance convention widens this, the card's disclosure
   * becomes wrong and this fails before a reader is misled.
   */
  it('stays inside the error this module discloses', () => {
    const errors: number[] = [];
    for (const b of BONDS) {
      const approx = approximateMaturity(b.issueCode);
      if (!approx || !b.maturityDate) continue;
      const actual = new Date(`${b.maturityDate}T00:00:00Z`);
      errors.push(Math.abs(actual.getTime() - approx.getTime()) / 86_400_000);
    }
    expect(errors.length, 'no bonds carried both a code and a maturity').toBeGreaterThan(20);
    expect(Math.max(...errors)).toBeLessThanOrEqual(MATURITY_APPROXIMATION_MAX_ERROR_DAYS);
  });
});

describe('band assignment', () => {
  it('places a term in exactly one band', () => {
    for (const years of [0.5, 2.9, 3, 6.9, 7, 14.9, 15, 30]) {
      const hits = TERM_BANDS.filter((b) => years >= b.fromYears && years < b.toYears);
      expect(hits.length, `${years}y matched ${hits.length} bands`).toBe(1);
    }
  });

  it('refuses a term that has already passed', () => {
    expect(bandFor(0)).toBeNull();
    expect(bandFor(-1)).toBeNull();
  });
});

describe('reinvestment availability, measured on the shipped archive', () => {
  const availability = reinvestmentAvailability(PRINTS);

  it('measures every band against the same set of observed months', () => {
    const observed = new Set(availability.map((a) => a.monthsObserved));
    expect(observed.size, 'bands compared against different denominators').toBe(1);
    expect([...observed][0]).toBeGreaterThan(24);
  });

  it('never claims a band was offered in more months than were observed', () => {
    for (const a of availability) {
      expect(a.monthsOffered).toBeLessThanOrEqual(a.monthsObserved);
      expect(a.share).toBeGreaterThanOrEqual(0);
      expect(a.share).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The finding itself, pinned.
   *
   * Short paper is scarcer than long paper — that is the whole reason this
   * card exists, and it is the practical face of a strategy that lengthens
   * average maturity. If the market changes so that it is no longer true, the
   * card's prose becomes wrong and this fails first.
   */
  it('shows short paper offered less often than long', () => {
    const short = availability.find((a) => a.band.id === 'short')!;
    const long = availability.find((a) => a.band.id === 'long')!;
    expect(short.auctions, 'too few short auctions to say anything').toBeGreaterThan(0);
    expect(
      short.share,
      `short paper offered in ${short.monthsOffered}/${short.monthsObserved} months, long in ${long.monthsOffered}/${long.monthsObserved}`
    ).toBeLessThan(long.share);
  });

  /**
   * The survivorship trap, written down so nobody "improves" this by joining.
   *
   * Matching auctions to bonds.json to read real maturity dates looks like the
   * more accurate implementation. bonds.json holds only CURRENTLY OUTSTANDING
   * bonds, so the join silently discards every matured one — which is to say
   * it discards short bonds preferentially, in exactly the direction that
   * would erase this module's finding.
   */
  it('uses more of the archive than a bonds.json join would leave', () => {
    const codes = new Set(BONDS.map((b) => b.issueCode.replace(/\/0*(\d)/g, '/$1')));
    const wouldSurvive = PRINTS.filter(
      (p) => p.issueCode && codes.has(p.issueCode.replace(/\/0*(\d)/g, '/$1'))
    ).length;
    const weUse = PRINTS.filter(
      (p) => p.auctionDate && p.issueCode && approximateMaturity(p.issueCode)
    ).length;
    expect(
      weUse,
      'the survivorship join would keep more rows than the code-derived method — check the assumption'
    ).toBeGreaterThan(wouldSurvive);
  });
});

describe('availabilityForTerm', () => {
  it('answers for a rung whose band the archive can support', () => {
    const a = availabilityForTerm(PRINTS, 10);
    expect(a).not.toBeNull();
    expect(a!.auctions).toBeGreaterThanOrEqual(MIN_AUCTIONS_FOR_A_CLAIM);
  });

  it('says nothing rather than quoting a percentage drawn from a handful', () => {
    // A band with too few auctions returns null. Reporting "offered in 100% of
    // months" off three prints would be arithmetically true and useless.
    const thin = availabilityForTerm(PRINTS.slice(0, 3), 10);
    expect(thin).toBeNull();
  });

  it('refuses a rung that has already matured', () => {
    expect(availabilityForTerm(PRINTS, 0)).toBeNull();
  });
});
