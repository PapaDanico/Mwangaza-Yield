// A reader of this site sees figures. What they need is the conclusion: is it
// worth locking money up, does it beat inflation, what does a long bond pay
// for its risk. Each insight here is a sentence built from figures the site
// already holds, with the arithmetic in one place so it can be tested.
//
// RULES THIS FOLLOWS
//   * An insight with a missing input is DROPPED, never filled in (see
//     "Absence is not zero" in CLAUDE.md).
//   * The headline compares against MEASURED inflation. The survey of what
//     firms expect is shown as a clearly labelled second clause, because an
//     opinion must not decide a verdict (see expectations.ts).
//   * Nothing here recommends a purchase. It states what the figures say.

import type { AuctionPrint, Bond, MacroIndicator, TBill } from '../types/bond';
import { computeTBill } from './tbills';
import { realRate, latestInflation } from './real-yield';
import { determineWHTRate } from './financial-engine';
import { dirtyPriceAtYield } from './switch';

export interface BriefItem {
  id: 'lock-in' | 'real-return' | 'long-bond';
  headline: string;
  detail: string;
  /** `good` = the figures favour the saver, `watch` = they warrant caution, `neutral` = informational. */
  tone: 'good' | 'watch' | 'neutral';
  /** Where the reader can work it out for themselves. */
  href: string;
  linkLabel: string;
}

/** Below this after-tax pickup a longer bill is not worth the lock. */
export const LOCK_IN_NEGLIGIBLE_PP = 0.15;
/** At or above this a longer bill pays visibly more for the wait. */
export const LOCK_IN_WORTH_IT_PP = 0.6;

const pp = (v: number, d = 2) => `${v.toFixed(d)}%`;
/** A gap between two rates is in percentage POINTS, not percent. */
/**
 * How long the bond's extra yearly pickup takes to earn back a price fall,
 * as a phrase. A price fall is an untaxed loss and the pickup is after tax,
 * so this errs against the bond. Under a month and over ten years are both
 * stated as such, since neither is a useful precise figure.
 */
export function breakevenYears(fallPct: number, pickupPtsPerYear: number): string {
  const years = fallPct / pickupPtsPerYear;
  if (years < 1 / 12) return 'less than a month';
  if (years > 10) return 'more than ten years';
  if (years < 1) return `${Math.max(1, Math.round(years * 12))} months`;
  return `${years.toFixed(1)} years`;
}

const pts = (v: number, d = 2) => `${v.toFixed(d)} ${Math.abs(v) === 1 ? 'point' : 'points'}`;
const ksh = (v: number) => `Ksh ${Math.round(v).toLocaleString('en-KE')}`;

export interface BriefInput {
  tbills: TBill[];
  macro: MacroIndicator[];
  bonds: Bond[];
  prints: AuctionPrint[];
  /** Mean of the banks' and non-banks' one-year expectation, or null. */
  expectedInflation1y: number | null;
  asOf?: Date;
}

export function decisionBrief(input: BriefInput): BriefItem[] {
  const asOf = input.asOf ?? new Date();
  const out: BriefItem[] = [];

  // Net effective yield per tenor, on Ksh 100,000 (the yield does not depend on the amount).
  const net = new Map<number, number>();
  for (const b of input.tbills) net.set(b.tenorDays, computeTBill(100_000, b.discountRate, b.tenorDays).netEAY);
  const n91 = net.get(91);
  const n364 = net.get(364);
  const bestBill = net.size ? Math.max(...net.values()) : null;

  /* ---- 1. Is it worth locking a year? ---- */
  if (n91 !== undefined && n364 !== undefined) {
    const pickup = n364 - n91;
    const perMillion = (pickup / 100) * 1_000_000;
    let headline: string;
    let tone: BriefItem['tone'];
    if (pickup < 0) {
      headline = 'Short bills pay more than a one-year lock';
      tone = 'watch';
    } else if (pickup < LOCK_IN_NEGLIGIBLE_PP) {
      headline = 'Locking a year pays almost nothing extra';
      tone = 'watch';
    } else if (pickup < LOCK_IN_WORTH_IT_PP) {
      headline = 'Locking a year pays a little extra';
      tone = 'neutral';
    } else {
      headline = 'Locking a year pays noticeably more';
      tone = 'good';
    }
    out.push({
      id: 'lock-in',
      headline,
      detail:
        `After tax the 364-day bill yields ${pp(n364)} against ${pp(n91)} for the 91-day: ` +
        (pickup >= 0
          ? `${pts(pickup)} more, about ${ksh(perMillion)} a year on Ksh 1 million`
          : `${pts(-pickup)} less, about ${ksh(-perMillion)} a year on Ksh 1 million`) +
        (pickup < LOCK_IN_WORTH_IT_PP
          ? '. That is little reward for losing the chance to reinvest if rates rise.'
          : '. That is the reward for not being able to reinvest if rates change.'),
      tone,
      href: '/tbills/',
      linkLabel: 'Compare T-bill tenors',
    });
  }

  /* ---- 2. Does the best bill beat inflation? ---- */
  const cpi = latestInflation(input.macro, asOf);
  if (bestBill !== null && cpi && !cpi.stale) {
    const real = realRate(bestBill, cpi.rate);
    const expected = input.expectedInflation1y;
    const vsExpected = expected !== null ? realRate(bestBill, expected) : null;
    out.push({
      id: 'real-return',
      headline: real >= 0 ? 'The best T-bill beats inflation, after tax' : 'Inflation is ahead of the best T-bill, after tax',
      detail:
        `${pp(bestBill)} after tax against inflation of ${pp(cpi.rate, 1)}: ` +
        `${pts(Math.abs(real))} ${real >= 0 ? 'above' : 'below'} inflation` +
        (vsExpected !== null && expected !== null
          ? `. Firms surveyed by CBK expect ${pp(expected, 1)} over the next year, which would put it ` +
            `${pts(Math.abs(vsExpected))} ${vsExpected >= 0 ? 'above' : 'below'} (an opinion, not a measurement).`
          : '.'),
      tone: real >= 1 ? 'good' : real >= 0 ? 'neutral' : 'watch',
      href: '/macro/',
      linkLabel: 'See the inflation picture',
    });
  }

  /* ---- 3. What does the longest recent bond pay for its risk? ---- */
  const bondCode = new Map(input.bonds.map((b) => [b.issueCode, b]));
  const newest = input.prints
    // 13 archive rows carry no auction date; they cannot be 'newest', and sorting them would throw.
    .filter((p) => typeof p.auctionDate === 'string' && Number.isFinite(p.weightedAverageRate) && bondCode.has(p.issueCode))
    .filter((p) => p.transactionType !== 'switch')
    // Newest auction first; among a day's bonds the longest-dated, which is the one
    // where the extra yield and the price risk are both largest.
    .sort(
      (a, b) =>
        b.auctionDate.localeCompare(a.auctionDate) ||
        bondCode.get(b.issueCode)!.maturityDate.localeCompare(bondCode.get(a.issueCode)!.maturityDate)
    )[0];
  if (newest && bestBill !== null) {
    const bond = bondCode.get(newest.issueCode)!;
    const years = (new Date(bond.maturityDate).getTime() - asOf.getTime()) / (365.25 * 86_400_000);
    if (years >= 3) {
      const gross = newest.weightedAverageRate as number;
      const wht = determineWHTRate(bond);
      const netApprox = gross * (1 - wht);
      const pickupPts = netApprox - bestBill;
      const base = dirtyPriceAtYield(bond, gross, asOf);
      const shocked = dirtyPriceAtYield(bond, gross + 1, asOf);
      const drop = (shocked / base - 1) * 100;
      if (Number.isFinite(drop) && drop < 0) {
        out.push({
          id: 'long-bond',
          headline: `A ${years.toFixed(0)}-year bond pays ${pts(netApprox - bestBill, 1)} more than the best bill`,
          detail:
            `${bond.issueCode} cleared at ${pp(gross)} on ${newest.auctionDate}, about ${pp(netApprox)} after ` +
            `${Math.round(wht * 100)}% tax, against ${pp(bestBill)} for the best bill. ` +
            `If market yields rose one point, its price would fall about ${pp(-drop, 1)}: a loss only if you sell before maturity.` +
            (pickupPts > 0
              ? ` The extra ${pts(pickupPts, 1)} a year would take about ${breakevenYears(-drop, pickupPts)} to make up that fall.`
              : ''),
          tone: 'neutral',
          href: '/ladder/',
          linkLabel: 'Build a ladder',
        });
      }
    }
  }

  return out;
}
