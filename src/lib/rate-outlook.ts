// How far the rate environment could fall from here.
//
// Every long projection in this app compounds a yield for years, and a yield is
// only observable TODAY. Bonds already held keep their coupon to maturity, but
// an accumulation plan keeps buying, and what it buys is priced by whatever the
// rate environment is at the time. So the real uncertainty in a fifteen-year
// FIRE projection is not which bond you pick — it is reinvestment.
//
// Rather than invent a haircut, this measures the fall the Kenyan policy rate
// has actually made within the published record. That is a claim the data
// supports and a user can check, which an arbitrary "assume 2% less" is not.

import type { RateDecision } from '@/types/bond';

export interface RateOutlook {
  /** The policy rate at the most recent MPC decision, %. */
  currentCBR: number;
  /** The lowest policy rate in the published record, %. */
  troughCBR: number;
  /** Percentage POINTS the policy rate would fall returning to that trough. */
  downsidePp: number;
  /** ISO date of the trough, so the claim can be checked. */
  troughDate: string;
  decisionsConsidered: number;
}

/**
 * Bond yields are quoted as the policy rate PLUS a term and credit spread, so a
 * fall in policy passes through roughly one-for-one in percentage points rather
 * than proportionally. Scaling instead — multiplying the yield by
 * trough/current — would cut a 16% yield to 10.5% on a 3-point policy fall,
 * treating the whole spread as if it collapsed too. Points, not ratios.
 */
export function analyseRateOutlook(decisions: RateDecision[]): RateOutlook | null {
  const rates = decisions.filter((d) => Number.isFinite(d.rate));
  if (rates.length < 2) return null;

  const byDate = [...rates].sort((a, b) => a.date.localeCompare(b.date));
  const current = byDate[byDate.length - 1];
  const trough = byDate.reduce((lo, d) => (d.rate < lo.rate ? d : lo), byDate[0]);

  return {
    currentCBR: current.rate,
    troughCBR: trough.rate,
    // Never negative: if today already sits at the record low there is no
    // further fall on the record to assume, and inventing one would be as
    // unfounded as the haircut this exists to avoid.
    downsidePp: Math.max(0, current.rate - trough.rate),
    troughDate: trough.date,
    decisionsConsidered: byDate.length,
  };
}

/**
 * The yield to plan on, given a yield observed today.
 *
 * Floored at 1%: a plan that assumes money earns nothing produces an infinite
 * capital requirement and a "never" completion date, which tells a saver
 * nothing they can act on. The floor is a guard against a degenerate answer,
 * not a forecast.
 */
export function conservativeYield(observedNetYield: number, outlook: RateOutlook | null): number {
  if (!outlook) return observedNetYield;
  return Math.max(1, observedNetYield - outlook.downsidePp);
}
