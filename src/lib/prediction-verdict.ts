/**
 * What the scored predictions actually entitle us to say.
 *
 * WRITTEN BEFORE THE RESULTS, ON PURPOSE
 * --------------------------------------
 * Five ranges were pre-registered for 12 and 24 August 2026. This module was
 * written on 6 August, while every one of them was still unscored, and that
 * timing is the whole point rather than a scheduling detail.
 *
 * Copy composed after the fact cannot help being shaped by the fact. A 5/5
 * would invite "our method works"; a 1/5 would invite hedging about unusual
 * conditions. Both are the same failure — letting the outcome pick the
 * standard. So the standard is fixed here, in code, keyed only to counts, and
 * the same function produces the triumphant and the humiliating sentence.
 *
 * THE TWO THINGS THAT WILL BE TEMPTING TO OMIT AFTERWARDS
 * ------------------------------------------------------
 * 1. FIVE PREDICTIONS ARE NOT FIVE INDEPENDENT TRIES. Three of them —
 *    IFB1/2019/016, IFB1/2021/018, IFB1/2021/021 — are infrastructure bonds
 *    settling on ONE auction date, 12 August. The other two are FXDs on
 *    24 August. Bonds in one auction clear into one order book on one
 *    afternoon; if the day surprises, it surprises all three together. The
 *    honest denominator is closer to TWO independent observations than five,
 *    and `independentEvents` counts distinct auction dates for that reason.
 *
 * 2. FOUR OF THE FIVE RAN ON THE WHOLE ARCHIVE. Their recorded `windowDays` is
 *    null — the full comparable pool back to 2022, spanning Kenya's 425bp
 *    easing cycle. The fifth's window is unknowable and recorded as absent.
 *    So NOT ONE of these five was anchored to a recent-only pool. If the
 *    ranges miss, that is the first place to look, and saying so now is the
 *    difference between a diagnosis and an alibi.
 *
 * WHY A CONFIDENCE INTERVAL AND NOT A PERCENTAGE
 * ----------------------------------------------
 * "100% hit rate" off five tries is a number with almost no information in it.
 * The Wilson score interval is used rather than the textbook normal
 * approximation because the normal one collapses to a zero-width interval at
 * 0/n and n/n — exactly the cases most likely to occur here, and exactly the
 * cases where overstatement is most tempting.
 *
 * At 5/5 the 95% interval still runs from roughly 57% upward. Counted as two
 * independent auction days, 2/2 runs from roughly 34% upward. A method that
 * truly hits one time in three is entirely consistent with going five for
 * five on these two afternoons.
 */

import type { Prediction, LedgerSummary } from './predictions';

/** 95% two-sided. */
const Z = 1.959964;

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion, as percentages.
 *
 * Chosen over the normal approximation because that one returns a zero-width
 * interval whenever every trial succeeded or every trial failed, which would
 * let "5 out of 5" print as "100%, ±0" — a false precision this ledger exists
 * to avoid producing.
 */
export function wilsonInterval(hits: number, n: number): Interval | null {
  if (!Number.isFinite(hits) || !Number.isFinite(n) || n <= 0 || hits < 0 || hits > n) return null;
  const p = hits / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (Z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    low: Math.max(0, Math.round((centre - margin) * 1000) / 10),
    high: Math.min(100, Math.round((centre + margin) * 1000) / 10),
  };
}

/**
 * Distinct auction dates among scored claims.
 *
 * Bonds sold in the same auction clear into the same order book on the same
 * afternoon, so they are not independent evidence about a method. Three of the
 * five standing predictions share 12 August; treating them as three
 * independent successes would inflate the apparent sample by half.
 */
export function independentEvents(claims: Prediction[]): number {
  return new Set(claims.map((p) => p.auctionDate)).size;
}

export interface EventTally {
  /** Auctions where EVERY claim hit. */
  hit: number;
  /** Auctions where every claim missed. */
  missed: number;
  /** Auctions where claims disagreed — neither a hit nor a miss. */
  split: number;
  total: number;
}

/**
 * Outcomes per auction, which is a different question from outcomes per bond.
 *
 * An auction is only a hit if every range recorded for it contained its
 * clearing rate, and only a miss if none did. When they disagree the auction
 * is SPLIT and counts as neither.
 *
 * The first version of this collapsed to `Math.min(events, hits)`, which
 * turned "3 hits across 2 auctions" into "2 of 2 auctions hit" — a statistic
 * about nothing, and flattering by construction. A split day is real
 * information about a method that priced bonds in one order book
 * inconsistently, and rounding it into a win would have hidden exactly that.
 */
export function tallyByEvent(claims: Prediction[]): EventTally {
  const byDate = new Map<string, boolean[]>();
  for (const p of claims) {
    const seen = byDate.get(p.auctionDate);
    if (seen) seen.push(!!p.hitRange);
    else byDate.set(p.auctionDate, [!!p.hitRange]);
  }
  let hit = 0, missed = 0, split = 0;
  for (const outcomes of byDate.values()) {
    if (outcomes.every(Boolean)) hit += 1;
    else if (outcomes.every((o) => !o)) missed += 1;
    else split += 1;
  }
  return { hit, missed, split, total: byDate.size };
}

/** How many of the scored claims ran on the full archive rather than a recent pool. */
export function wholeArchiveCount(claims: Prediction[]): number {
  // `null` means the whole archive; ABSENT means unknowable, which cannot be
  // counted as a recent window either. Both are "not anchored to today".
  return claims.filter((p) => p.windowDays === null || p.windowDays === undefined).length;
}

export type VerdictTone = 'none' | 'encouraging' | 'mixed' | 'poor';

export interface Verdict {
  tone: VerdictTone;
  /** One sentence stating the result without spin. */
  headline: string;
  /** Everything a reader needs to not over-read the headline. */
  caveats: string[];
}

/**
 * The interpretation, keyed only to counts.
 *
 * Deliberately returns caveats for the GOOD outcomes too. A ledger that
 * qualifies its failures and not its successes is not a ledger, it is
 * marketing with a table in it.
 */
export function scoringVerdict(ledger: Prediction[], summary: LedgerSummary): Verdict {
  const claims = ledger.filter((p) => p.scoredOn !== undefined && !p.thin);
  const n = summary.claims;

  if (n === 0) {
    return {
      tone: 'none',
      headline: 'Nothing has been scored yet, so there is no hit rate and none is claimed.',
      caveats: [],
    };
  }

  const hits = summary.hitRange;
  const events = independentEvents(claims);
  const byRange = wilsonInterval(hits, n);
  const tally = tallyByEvent(claims);
  const archive = wholeArchiveCount(claims);

  const caveats: string[] = [];

  if (events < n) {
    caveats.push(
      `These ${n} predictions came from ${events} auction${events === 1 ? '' : 's'}, not ${n}. ` +
      `Bonds sold on the same afternoon clear into the same order book, so a day that ` +
      `surprises surprises all of them together — the honest sample is closer to ${events}.`
    );
  }

  if (byRange) {
    caveats.push(
      `${hits} of ${n} is consistent with a true hit rate anywhere from ` +
      `${byRange.low}% to ${byRange.high}% (95% interval). Small samples say very little in ` +
      `either direction.`
    );
  }

  // The by-auction reading, stated ONLY when it means something.
  //
  // A split auction — some ranges held, some did not, on one afternoon — is
  // neither a hit nor a miss, and quoting an interval over a denominator that
  // excludes it would be arithmetic about a subset dressed as a summary. When
  // every auction is unanimous the interval is honest and is the more
  // conservative of the two, so it is worth printing.
  if (tally.split > 0) {
    caveats.push(
      `${tally.split} of those ${tally.total} auction${tally.total === 1 ? '' : 's'} was split — ` +
      `some ranges held and others did not on the same afternoon. That is not a hit or a miss ` +
      `for the auction, so no per-auction rate is quoted.`
    );
  } else if (tally.total > 0 && tally.total < n) {
    const byEvent = wilsonInterval(tally.hit, tally.total);
    if (byEvent) {
      caveats.push(
        `Counted by auction rather than by bond — ${tally.hit} of ${tally.total} — the same ` +
        `interval runs from ${byEvent.low}% to ${byEvent.high}%, which is the more conservative ` +
        `reading and the one to prefer.`
      );
    }
  }

  if (archive > 0) {
    caveats.push(
      `${archive === n ? 'Every one' : `${archive} of ${n}`} of these ranges was computed ` +
      `from the whole comparable archive back to 2022 rather than a recent-only pool — a span ` +
      `that contains Kenya's 425bp easing cycle. That was recorded before the auctions, not ` +
      `argued afterwards, and it is the first thing to examine either way.`
    );
  }

  const rate = hits / n;
  if (rate === 1) {
    return {
      tone: 'encouraging',
      headline: `Every one of the ${n} stated ranges contained the clearing rate.`,
      caveats: [
        ...caveats,
        'A clean sweep this small is not evidence the method is calibrated. It is the ' +
        'result most likely to be over-read, which is why the interval above is quoted ' +
        'rather than the percentage.',
      ],
    };
  }

  if (rate === 0) {
    return {
      tone: 'poor',
      headline: `None of the ${n} stated ranges contained the clearing rate.`,
      caveats: [
        ...caveats,
        'This is the outcome the ledger was built to be able to report. The ranges are ' +
        'unchanged from what was published before bidding closed, and nothing here has ' +
        'been re-fitted to the result.',
      ],
    };
  }

  return {
    tone: rate >= 0.5 ? 'mixed' : 'poor',
    headline:
      `${hits} of ${n} stated ranges contained the clearing rate; ` +
      `${n - hits} did not.`,
    caveats,
  };
}
