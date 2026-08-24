/**
 * Where today sits in Kenya's rate history, in words a non-specialist can use.
 *
 * WHAT THIS IS FOR
 *
 * Every other tool here answers "what is the rate?". That question is now
 * answered in a dozen places by a dozen products, and answering it faster is
 * not a business. The question nobody answers for a Kenyan saver is "is this
 * high or low, and what usually happens next?" — and answering it requires
 * something most publishers do not have: a cleaned run of CBK decisions and
 * auction results going back through more than one full cycle.
 *
 * THE HONESTY PROBLEM WITH ANALOGUES, WHICH IS SEVERE
 *
 * "Rates were last here in 2019" is an easy sentence to write and a dangerous
 * one to believe. Kenya has had roughly two full rate cycles in this archive.
 * Two. Any claim of the form "this happened before, so it will happen again"
 * rests on a sample that would embarrass anyone who stated it out loud, and
 * the temptation is to state it quietly instead, in a confident tone, with the
 * sample size omitted.
 *
 * So every function here returns its sample count alongside its answer, the UI
 * is required to print it, and `analogueStrength` exists to say plainly when
 * there is not enough history to say anything. A regime lens that cannot
 * return "I don't know" is a horoscope.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No forecast. This describes where today sits; it does not project, and
 * nothing here feeds the bid guidance. The distinction matters because a
 * described analogue reads like a prediction to a reader who wants one, and
 * the wording is chosen to resist that.
 *
 * NO POLICY-RATE CYCLE EITHER, AND THAT IS THE POINT OF THIS PARAGRAPH
 *
 * The first draft of this module carried a `describeRegime` that classified
 * the CBR into easing/tightening/holding and reported the distance from the
 * peak. lib/rate-cycle.ts had done that for months, better, and its own
 * comments warn against precisely the error the draft made: it reported today
 * as "925bps below the peak" measured against the 18.00% of December 2011 —
 * a single easing that never happened, spanning three separate cycles and
 * fifteen years. rate-cycle.ts measures from where the CURRENT run began,
 * which is the honest comparison.
 *
 * Two engines would not merely have duplicated each other; the dashboard would
 * have shown a reader two different answers to one question, on one screen.
 * The draft was deleted. Anything about the policy rate belongs in
 * rate-cycle.ts — this module is only about where a YIELD sits against its own
 * auction history, which nothing else here measures.
 */

import type { AuctionPrint, Bond } from '../types/bond';
import { normaliseCode, clearingRate, auctionKind } from './auction-history';
import { yearsToMaturityAt } from './bid';

export interface YieldContext {
  /** The most recent clearing rate found for roughly this tenor. */
  latestRate: number;
  latestDate: string;
  /** Share of past auctions at this tenor that cleared BELOW today, 0-1. */
  percentile: number;
  observations: number;
  /** The last time this tenor cleared within 25bps of today, before this year. */
  lastSeenAt: string | null;
}

/**
 * Where today's clearing rate for a given tenor sits against its own history.
 *
 * Uses the FULL archive rather than the 2022 cutoff that bid guidance applies.
 * The reason the cutoff exists there is that a headline forecast must not rest
 * on records whose clearing rate is missing a fifth of the time; here the
 * missing ones are simply absent from the distribution, and describing where
 * today sits among the readings that DO exist is a weaker claim that the older
 * data can carry. `observations` is returned so the reader sees what it rests
 * on.
 */
export function yieldContext(
  prints: AuctionPrint[],
  bonds: Bond[],
  targetYears: number,
  asOf: string,
  toleranceYears = 2
): YieldContext | null {
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  const points: { date: string; rate: number }[] = [];

  for (const p of prints) {
    if (!p.auctionDate || p.auctionDate > asOf) continue;
    if (auctionKind(p) !== 'issuance') continue;
    const bond = byCode.get(normaliseCode(p.issueCode));
    const rate = clearingRate(p);
    if (!bond || rate === null) continue;
    const ytm = yearsToMaturityAt(bond, new Date(p.auctionDate));
    if (Math.abs(ytm - targetYears) > toleranceYears) continue;
    points.push({ date: p.auctionDate, rate });
  }
  if (points.length < 5) return null;

  points.sort((a, b) => a.date.localeCompare(b.date));
  const latest = points[points.length - 1];
  const below = points.filter((p) => p.rate < latest.rate).length;

  /* "Last time we were here" deliberately skips the last twelve months: the
   * interesting answer is the previous era, not last quarter, and without the
   * exclusion this almost always returns a date a few weeks ago and reads as
   * though nothing has changed. */
  const cutoff = new Date(new Date(asOf).getTime() - 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const near = points.filter(
    (p) => p.date < cutoff && Math.abs(p.rate - latest.rate) <= 0.25
  );

  return {
    latestRate: latest.rate,
    latestDate: latest.date,
    percentile: below / points.length,
    observations: points.length,
    lastSeenAt: near.length ? near[near.length - 1].date : null,
  };
}

/**
 * How much weight a reader should put on an analogue, stated as a word.
 *
 * Exists so the UI cannot quietly present two observations in the same voice
 * as forty. Kenya has had about two full rate cycles in this archive, so
 * 'none' and 'weak' are the honest answers far more often than anyone
 * building this feature would like.
 */
export function analogueStrength(observations: number): 'none' | 'weak' | 'moderate' {
  if (observations < 5) return 'none';
  if (observations < 20) return 'weak';
  return 'moderate';
}
