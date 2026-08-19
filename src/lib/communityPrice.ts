/**
 * Community Price Book — privacy-first aggregation of user-contributed prices.
 *
 * No individual price is ever displayed. No timestamp is stored more precisely
 * than a calendar date. When fewer than 3 submissions exist for a bond, no
 * community stats are shown at all. Differential privacy noise is applied when
 * fewer than 5 submissions exist.
 *
 * Every anonymized record lives only in the user's own IndexedDB. The word
 * "community" here describes aggregation of the user's own observations over
 * time (from different brokers, different dates), not a server-side pool.
 */

export const PRICE_SOURCES = ['DhowCSD', 'Broker', 'Bank', 'Secondary Market', 'Other'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

/** A raw price submission before anonymization. */
export interface PriceSubmission {
  isin: string;
  /** Clean price per 100 face value. */
  price: number;
  /** ISO date string the reader observed this price. */
  observedOn: string;
  source: PriceSource;
}

/** A submission after anonymization, safe to store and aggregate. */
export interface AnonymizedSubmission {
  isin: string;
  /** Rounded to nearest 0.25; possibly perturbed by Laplace noise. */
  price: number;
  /** Day-level ISO date only — no time component. */
  date: string;
  source: PriceSource;
}

/** Community aggregate for one bond, only produced when count >= 3. */
export interface CommunityPrice {
  isin: string;
  median: number;
  min: number;
  max: number;
  count: number;
  /** Most recent observation date in the submission set. */
  lastUpdated: string;
}

export type FairValueVerdict = 'above' | 'below' | 'at';

export interface SpreadResult {
  isin: string;
  /** (communityPrice − theoreticalPrice) / theoreticalPrice. Negative = below. */
  spreadPct: number;
  verdict: FairValueVerdict;
  badgeText: string;
  badgeColor: 'red' | 'green' | 'gold';
}

// Privacy thresholds
/** Minimum submissions required before ANY community stat is revealed. */
export const COMMUNITY_MIN_SUBMISSIONS = 3;
/** Below this count, Laplace noise is added to the anonymized price. */
const LAPLACE_THRESHOLD = 5;

// Fair value spread thresholds
const AT_THRESHOLD_PCT = 0.02;    // ±2 % → "At fair value"
const ABOVE_THRESHOLD_PCT = 0.05; // > 5 % above → red badge

/** Round a price to the nearest 0.25 (the market's conventional tick). */
export function roundToQuarter(price: number): number {
  return Math.round(price * 4) / 4;
}

/**
 * Draw a sample from Laplace(0, scale) using the inverse CDF method.
 *
 * For differential privacy: sensitivity = 0.25 (one tick), epsilon = 1.0.
 * This keeps the noise on the same order of magnitude as the rounding step so
 * it meaningfully masks a precise entry without making the aggregate useless.
 */
function laplaceNoise(sensitivity: number, epsilon: number): number {
  const scale = sensitivity / epsilon;
  // Uniform sample on (−0.5, 0.5), avoiding the endpoints where log is undefined.
  const u = (Math.random() - 0.5) * (1 - 1e-10);
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Anonymize a single submission before storing it.
 *
 * - Timestamps are stripped to day-level (no time component).
 * - Price is rounded to the nearest 0.25.
 * - When the bond has fewer than LAPLACE_THRESHOLD existing submissions,
 *   Laplace noise is added and the result re-rounded to prevent trivial
 *   de-anonymization of a lone entry.
 */
export function anonymizeSubmission(
  submission: PriceSubmission,
  existingCount: number,
): AnonymizedSubmission {
  const date = submission.observedOn.slice(0, 10);
  const rounded = roundToQuarter(submission.price);

  const price =
    existingCount < LAPLACE_THRESHOLD
      ? roundToQuarter(rounded + laplaceNoise(0.25, 1.0))
      : rounded;

  return {
    isin: submission.isin,
    price,
    date,
    source: submission.source,
  };
}

/** Median of a non-empty array (does not mutate the input). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * Aggregate anonymized submissions into community stats.
 *
 * Returns null when fewer than COMMUNITY_MIN_SUBMISSIONS records exist — the
 * minimum threshold before any aggregate is shown. This prevents a single
 * recorded price from being surfaced as though it were a market consensus.
 */
export function aggregatePrices(
  submissions: AnonymizedSubmission[],
): CommunityPrice | null {
  if (submissions.length < COMMUNITY_MIN_SUBMISSIONS) return null;

  const prices = submissions.map((s) => s.price);
  const lastUpdated = submissions.reduce((a, b) =>
    a.date >= b.date ? a : b,
  ).date;

  return {
    isin: submissions[0]!.isin,
    median: roundToQuarter(median(prices)),
    min: Math.min(...prices),
    max: Math.max(...prices),
    count: prices.length,
    lastUpdated,
  };
}

/**
 * Compute the fair-value spread between the community median and the
 * theoretical price from the fitted yield curve.
 *
 * Positive spread means the market is pricing the bond ABOVE theoretical
 * (i.e., it is expensive relative to the curve). Negative means below
 * (cheap). The curve price is typically derived from the Nelson-Siegel or
 * spline fit on recent auction results.
 */
export function computeFairValueSpread(
  isin: string,
  communityPrice: number,
  theoreticalPrice: number,
): SpreadResult {
  const spreadPct = (communityPrice - theoreticalPrice) / theoreticalPrice;

  let verdict: FairValueVerdict;
  let badgeText: string;
  let badgeColor: 'red' | 'green' | 'gold';

  if (Math.abs(spreadPct) <= AT_THRESHOLD_PCT) {
    verdict = 'at';
    badgeText = 'At fair value';
    badgeColor = 'green';
  } else if (spreadPct > AT_THRESHOLD_PCT) {
    verdict = 'above';
    const pct = (spreadPct * 100).toFixed(1);
    badgeText = `Community trading at +${pct}% above fair value`;
    badgeColor = spreadPct > ABOVE_THRESHOLD_PCT ? 'red' : 'gold';
  } else {
    verdict = 'below';
    const pct = (Math.abs(spreadPct) * 100).toFixed(1);
    badgeText = `Community trading at ${pct}% below fair value`;
    badgeColor = 'green';
  }

  return { isin, spreadPct, verdict, badgeText, badgeColor };
}
