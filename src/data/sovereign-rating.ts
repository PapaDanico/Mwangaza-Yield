/**
 * Kenya's sovereign credit rating — the professional answer to the question
 * the dashboard already asks.
 *
 * WHY THIS IS NOT SCRAPED
 * -----------------------
 * Every other figure in "Can the borrower pay?" comes from the World Bank API
 * and refreshes itself. A rating cannot: the agencies publish it in press
 * releases, on pages that are neither machine-readable nor licensed for
 * redistribution, and a rating read from the wrong page or the wrong date is
 * worse than none — it is the single most load-bearing number a lender sees.
 *
 * So this follows the gazetted-holidays pattern. A human reads a citable
 * document and types what it says, with the reference attached. The source
 * here is one CBK publication reproducing all three agencies in one table,
 * which is better than three separate agency pages: it is a single primary
 * document, dated, from the country's central bank.
 *
 * THE RULE FOR CHANGING A ROW
 * ---------------------------
 * Replace a row only from a document you can cite, and update `AS_OF` to that
 * document. Do not "refresh" a rating from memory or from a news headline; a
 * downgrade misdated by a month is a false statement about credit risk.
 *
 * Source: Central Bank of Kenya, Monthly Economic Bulletin, January 2026,
 * "ANNEX 1: KENYA'S CREDIT RATING" (sourced there to the National Treasury).
 */

export interface SovereignRating {
  agency: string;
  /** The rating exactly as the agency writes it. */
  rating: string;
  outlook: string;
  /** ISO date the rating was assigned. */
  since: string;
  /** What it replaced, so a reader can see the direction of travel. */
  previous?: { rating: string; outlook: string; since: string };
}

/** The bulletin these rows were read from. */
export const RATING_SOURCE = {
  title: 'CBK Monthly Economic Bulletin, January 2026 — Annex 1',
  publisher: 'Central Bank of Kenya',
  /** The month the bulletin covers, not the day it was read. */
  asOf: '2026-01-31',
} as const;

export const SOVEREIGN_RATINGS: readonly SovereignRating[] = [
  {
    agency: 'S&P Global',
    rating: 'B',
    outlook: 'Stable',
    since: '2025-08-22',
    previous: { rating: 'B-', outlook: 'Stable', since: '2024-08-22' },
  },
  {
    agency: 'Fitch',
    rating: 'B-',
    outlook: 'Stable',
    since: '2025-07-25',
    previous: { rating: 'B-', outlook: 'Stable', since: '2024-07-25' },
  },
  {
    agency: "Moody's",
    rating: 'B3',
    outlook: 'Stable',
    since: '2026-01-27',
    previous: { rating: 'Caa1', outlook: 'Positive', since: '2025-08-25' },
  },
];

/**
 * Moody's uses a different alphabet from S&P and Fitch, and a reader comparing
 * "B-" against "B3" has no way to know they are the SAME rung without a table.
 * Without this mapping the panel would look like disagreement where there is
 * none — Fitch B- and Moody's B3 are equivalent, and S&P at B is one notch
 * above both.
 */
const NOTCH: Record<string, number> = {
  B: 0,
  B2: 0,
  'B-': 1,
  B3: 1,
  'CCC+': 2,
  Caa1: 2,
};

/** True when the agencies do not all sit on the same rung. */
export function ratingsDisagree(ratings: readonly SovereignRating[] = SOVEREIGN_RATINGS): boolean {
  const rungs = new Set(ratings.map((r) => NOTCH[r.rating]).filter((n) => n !== undefined));
  return rungs.size > 1;
}

/**
 * What the band MEANS, in the agencies' own vocabulary rather than ours.
 *
 * Every rating currently on the list sits in the single-B band, which all
 * three agencies define as speculative — capacity to pay exists now and is
 * vulnerable to deterioration. Saying that plainly is the point: a reader
 * looking at seven green-ish World Bank indicators can otherwise come away
 * thinking these bonds are the risk-free asset the textbooks describe, and
 * they are not. It is not a reason to avoid them. It is the reason the yields
 * are what they are.
 */
export const BAND_MEANING =
  'All three agencies place Kenya in the single-B band — speculative grade. ' +
  'That is not a prediction of default; it means the capacity to pay exists ' +
  'today and is vulnerable to a downturn. It is also why these bonds yield ' +
  'what they do: the return is payment for that risk, not a free lunch.';
