/**
 * A yield that is really the coupon, wearing a yield's name.
 *
 * WHAT THIS CATCHES
 *
 * When a bond enters bonds.json without an auction result to solve a yield
 * from, `ytmGross` has been filled with `couponRate` and `ytmAsOf` left null.
 * The record then reads as a market yield to every consumer — TopYields, the
 * yield curve, the calculator's source panel — and none of them can tell it
 * apart from a real one, because the only thing marking it is a null date and
 * an equality nobody checks.
 *
 * FXD1/2012/015 and FXD1/2010/025 both carried their coupon that way, and
 * fourteen more bonds carried a real yield with no date at all — which is the
 * same defect one step less obvious, because nothing downstream can tell a
 * mark from last week apart from one from 2014.
 *
 * This is the house rule in its usual form: absence is not zero, and it is not
 * the nearest number to hand either. The right value for an unknown yield is
 * null, and each consumer decides what to show.
 *
 * ALL TWENTY WERE FIXABLE WITHOUT LEAVING THE REPOSITORY
 *
 * The first version of this file allowlisted FXD1/2010/025 as unfixable, on
 * the assumption that a session cannot reach CBK so no source could exist.
 * That assumption was wrong. auction-results.json already held a dated
 * clearing yield for every one of them; the two files had simply never been
 * reconciled. `scripts/date-bond-yields.mjs` does that now, and the allowlist
 * below is empty as a result.
 *
 * The allowlist stays, empty, because its job is to stop the set GROWING and
 * to make removing an entry the thing that closes a gap out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Bond {
  issueCode: string;
  couponRate: number | null;
  ytmGross: number | null;
  ytmAsOf?: string | null;
}

const bonds: Bond[] = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'bonds.json'), 'utf8')
);

/**
 * Empty, and that is the point.
 *
 * It was opened with one entry — FXD1/2010/025, carrying its 11.25% coupon as
 * a yield — on the assumption that no source for it existed here. That was
 * wrong: auction-results.json held its July 2010 clearing yield of 9.839% the
 * whole time, and `scripts/date-bond-yields.mjs` found it along with 19 others.
 *
 * Shrink this list; never extend it. A new entry means a bond was published
 * with its coupon standing in for a yield, and the fix is a real auction
 * result or prospectus, not a line here.
 */
const KNOWN_PLACEHOLDERS = new Set<string>([]);

const isPlaceholder = (b: Bond) =>
  b.ytmGross !== null && b.ytmGross === b.couponRate && !b.ytmAsOf;

describe('the sweep itself', () => {
  it('parsed a real bond universe, so this cannot pass vacuously', () => {
    expect(bonds.length).toBeGreaterThan(40);
    for (const b of bonds) expect(b.issueCode).toMatch(/^(FXD|IFB|SDB)/);
  });
});

describe('no bond publishes its coupon as a market yield', () => {
  it('has no undated coupon-as-yield beyond the ones already known', () => {
    const found = bonds.filter(isPlaceholder).map((b) => b.issueCode);
    const fresh = found.filter((c) => !KNOWN_PLACEHOLDERS.has(c));

    expect(
      fresh,
      'These bonds carry ytmGross === couponRate with no ytmAsOf, which is a ' +
        'placeholder reading as a market yield. Source a real yield from an ' +
        'auction result or prospectus, or set ytmGross to null so consumers ' +
        'can see there is nothing to show.'
    ).toEqual([]);
  });

  it('does not leave a closed entry sitting on the allowlist', () => {
    const stillOpen = bonds.filter(isPlaceholder).map((b) => b.issueCode);
    const stale = [...KNOWN_PLACEHOLDERS].filter((c) => !stillOpen.includes(c));

    expect(
      stale,
      'These are allowlisted but no longer placeholders — they have been ' +
        'fixed. Remove them from KNOWN_PLACEHOLDERS so the list keeps meaning ' +
        'what it says.'
    ).toEqual([]);
  });
});

describe('every yield can be aged', () => {
  /**
   * YieldCurveChart refuses to describe the curve's shape unless every point
   * is dated and under a year old. Sixteen undated yields were holding that
   * explanation off the page for a reason no reader could see — the chart was
   * being cautious about ages it simply had not been given.
   */
  it('no bond publishes a yield without a date', () => {
    const undated = bonds.filter((b) => b.ytmGross !== null && !b.ytmAsOf).map((b) => b.issueCode);
    expect(
      undated,
      'A yield with no date cannot be aged, so nothing downstream can tell a ' +
        'mark from last week apart from one from 2014. Run ' +
        '`node scripts/date-bond-yields.mjs` — it reconciles bonds.json ' +
        'against auction results this repository already holds.'
    ).toEqual([]);
  });

  it('dates no yield into the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ahead = bonds.filter((b) => b.ytmAsOf && b.ytmAsOf > today).map((b) => b.issueCode);
    expect(ahead, 'a yield dated after today is a parse error, not a forecast').toEqual([]);
  });
});

describe('FXD1/2012/015 is marked from an auction, not from a prospectus', () => {
  /**
   * CBK's August 2026 switch prospectus quotes a prevailing market yield of
   * 9.0935% for this bond. It is tempting — it is five years fresher than
   * anything else we hold for it — and it is not a market observation. It is
   * the yield CBK is USING TO PRICE a switch that settles 26 August 2026, and
   * the prospectus's accrued interest of KES 3.3736 per 100 confirms it: that
   * works out to roughly 101 days from the May coupon, i.e. discounted to
   * settlement, in the future.
   *
   * Writing it into ytmAsOf dated the yield after today. The future-date
   * assertion above caught that, which is why it is there. A forward pricing
   * input is not a mark, and this file holds marks.
   *
   * Its 2026-08-24 auction result is the thing to ingest, once it exists.
   */
  it('uses the last observed clearing yield', () => {
    const b = bonds.find((x) => x.issueCode === 'FXD1/2012/015');
    expect(b, 'FXD1/2012/015 missing from bonds.json').toBeDefined();
    expect(b!.ytmGross).toBe(11.474);
    expect(b!.ytmAsOf).toBe('2021-07-19');
    // Not the coupon, which is what it used to carry.
    expect(b!.couponRate).toBe(11.0);
    expect(b!.ytmGross).not.toBe(b!.couponRate);
  });
});
