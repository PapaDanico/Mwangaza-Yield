/**
 * Never present a past date as the next auction.
 *
 * WHAT WENT WRONG
 * ---------------
 * `tbills.json` carries `nextAuctionDate` as a fact recorded when the row was
 * scraped, and `/tbills/` rendered it directly:
 *
 *     next auction {selected.nextAuctionDate}
 *
 * On 16 August 2026 that read **next auction 2026-08-06** — ten days gone. The
 * row was scraped from the 30 July auction, which correctly named 6 August as
 * the one after it; two weekly auctions then happened without the T-bill rows
 * being refreshed, and nothing checked whether the stored date had aged out.
 *
 * A stale rate is a disclosed inaccuracy — every figure on this site carries
 * its `asOf`, and the freshness banner says when the pipeline last ran. A past
 * date labelled "next" is a different thing: it is not old, it is wrong, and a
 * reader planning which Thursday to bid on has no way to tell.
 *
 * WHY THIS DOES NOT COMPUTE THE REAL DATE
 * ---------------------------------------
 * It is tempting. T-bills are auctioned weekly and this very page says "Sold
 * every Thursday", so the next Thursday is a two-line calculation.
 *
 * It would also be a figure we invented. CBK moves auctions for public
 * holidays, and the tenor being under notice — the 364-day is being phased out
 * — is exactly the kind of change that shows up as a skipped week rather than
 * an announcement. Printing a computed Thursday would look identical to a
 * scraped one and carry none of its authority.
 *
 * So this reports that the schedule has aged out and leaves the page to say
 * so. Silence about what we do not know beats a confident guess, which is the
 * same standard `/tbills/` already holds when it states outright that it
 * publishes no secondary-market prices.
 */

/**
 * Is a stored auction date still in the future?
 *
 * Compared by calendar day rather than by instant: an auction happening today
 * has not passed, and a reader in Nairobi should not see the date vanish
 * because a UTC clock rolled over first.
 */
export function isUpcoming(auctionDate: string, now: Date = new Date()): boolean {
  if (!auctionDate) return false;
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const parsed = new Date(`${auctionDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= today.getTime();
}

/**
 * What to print after "next auction", or null to print nothing.
 *
 * Returning null rather than a placeholder lets the caller drop the clause
 * entirely — "next auction unknown" is noise on a line whose other half
 * (the minimum and the multiples) is still perfectly true.
 */
export function nextAuctionLabel(
  auctionDate: string,
  now: Date = new Date()
): string | null {
  return isUpcoming(auctionDate, now) ? auctionDate : null;
}
