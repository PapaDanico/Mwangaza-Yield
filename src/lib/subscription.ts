import type { AuctionPrint } from '../types/bond';

/**
 * How much money chased each auction, and how much of it the Treasury took.
 *
 * This is the demand side of the same story the reinvestment card tells from
 * the supply side. A ladder's rung rolls into whatever the next auction sells,
 * and the price it rolls in at depends on whether that auction was fought over
 * or ignored. Two ratios say it:
 *
 *   subscription = bids received / amount offered
 *   take-up      = amount accepted / amount offered
 *
 * Subscription under 1.0 means the auction did not attract the money it asked
 * for. Take-up well below subscription means the money was there and the
 * Treasury refused it — bidders demanded a rate it would not pay. The gap
 * between the two is the more informative number of the pair, and neither is
 * derivable from a yield.
 *
 * WHY THIS GROUPS BY DOCUMENT AND NOT BY BOND
 * -------------------------------------------
 * amountOfferedKESM is an AUCTION-level figure — the type says so — and a
 * multi-bond auction repeats it on every bond's record. Bids are per bond.
 * So the obvious per-record division is wrong twice over: it understates
 * demand by comparing one bond's bids against the whole auction's offer, and
 * then it reports the same auction several times. On 27 July 2026 the per-bond
 * reading gives 1.55x for one leg while the auction actually drew 2.15x.
 *
 * WHY NOT BY DATE EITHER
 * ----------------------
 * That was my first instinct and it is also wrong. On 17 February 2025 CBK
 * held two separate auctions, in two separate documents, offering Ksh 50bn and
 * Ksh 70bn. Grouping by date fuses them and divides by whichever offer was
 * read first. The document is the auction, so sourceUrl is the key. Checked:
 * across all 224 documents, the offered figure is internally consistent in
 * every one — grouping by date is inconsistent in one.
 *
 * WHAT THIS IS NOT AFFECTED BY
 * ----------------------------
 * Only the amount fields, so the accepted-vs-market rate defect that runs
 * through the yield figures does not touch these numbers.
 */

export interface AuctionDemand {
  auctionDate: string;
  sourceUrl: string;
  /** Bonds sold in this auction, in issue-code order. */
  issueCodes: string[];
  offeredKESM: number;
  bidsReceivedKESM: number;
  amountAcceptedKESM: number;
  /** bids / offered. Below 1.0 is undersubscribed. */
  subscription: number;
  /**
   * accepted / offered, or null when the two figures are on different bases.
   *
   * Some tap sales state bids at FACE value and acceptance at cost. On a
   * discount bond those differ by one to two percent, which is enough to make
   * the archive show four auctions accepting slightly MORE than was bid — not
   * a parser error, and the parser deliberately allows it. Comparing take-up
   * against subscription across that mismatch reads a currency difference as a
   * behavioural one, so it is refused rather than reported with a caveat.
   */
  takeUp: number | null;
  /** True when the bids figure is stated at face value rather than at cost. */
  bidsAtFaceValue: boolean;
}

const FACE_VALUE_RE = /face\s*value/i;

/** Fewer than this and a median says more about which auctions parsed than about the market. */
export const MIN_AUCTIONS_FOR_A_MEDIAN = 6;

/** The window the headline figure describes — about a year of auctions. */
export const RECENT_AUCTIONS = 12;

/**
 * One row per auction document, oldest first.
 *
 * A document is skipped when its records disagree about the offered amount,
 * because that means the auction-level figure was misread on at least one of
 * them and there is no way to tell which. Dropping it loses one auction;
 * averaging the disagreement would put a wrong number in the series and give
 * no sign of it.
 */
export function auctionDemand(prints: AuctionPrint[]): AuctionDemand[] {
  const byDocument = new Map<string, AuctionPrint[]>();
  for (const p of prints) {
    if (!p.sourceUrl || !p.auctionDate) continue;
    if (!p.amountOfferedKESM || !p.bidsReceivedKESM) continue;
    if (!byDocument.has(p.sourceUrl)) byDocument.set(p.sourceUrl, []);
    byDocument.get(p.sourceUrl)!.push(p);
  }

  const out: AuctionDemand[] = [];
  for (const [sourceUrl, rows] of byDocument) {
    const offers = new Set(rows.map((r) => r.amountOfferedKESM));
    if (offers.size !== 1) continue;
    const offeredKESM = rows[0].amountOfferedKESM!;
    if (!(offeredKESM > 0)) continue;

    const bidsReceivedKESM = rows.reduce((s, r) => s + (r.bidsReceivedKESM ?? 0), 0);
    const amountAcceptedKESM = rows.reduce((s, r) => s + (r.amountAcceptedKESM ?? 0), 0);
    const bidsAtFaceValue = rows.some((r) => FACE_VALUE_RE.test(r.bidsLabel ?? ''));
    out.push({
      auctionDate: rows[0].auctionDate!,
      sourceUrl,
      issueCodes: rows.map((r) => r.issueCode ?? '').filter(Boolean).sort(),
      offeredKESM,
      bidsReceivedKESM,
      amountAcceptedKESM,
      subscription: bidsReceivedKESM / offeredKESM,
      takeUp: bidsAtFaceValue ? null : amountAcceptedKESM / offeredKESM,
      bidsAtFaceValue,
    });
  }

  return out.sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface DemandSummary {
  recent: AuctionDemand[];
  /** Median subscription across `recent`, or null when there are too few. */
  medianSubscription: number | null;
  /** Median across everything parsed, for comparison. */
  medianSubscriptionAllTime: number | null;
  /** How many of `recent` failed to attract the money on offer. */
  undersubscribed: number;
  totalAuctions: number;
}

/**
 * The recent window against the long record.
 *
 * Both numbers are reported because either alone misleads. "Median 1.19x"
 * across seventeen years describes a market that no longer exists; "0.86x last
 * month" is one auction. The comparison is the finding.
 */
export function demandSummary(
  prints: AuctionPrint[],
  window: number = RECENT_AUCTIONS
): DemandSummary | null {
  const all = auctionDemand(prints);
  if (all.length < MIN_AUCTIONS_FOR_A_MEDIAN) return null;
  const recent = all.slice(-window);
  return {
    recent,
    medianSubscription:
      recent.length >= MIN_AUCTIONS_FOR_A_MEDIAN ? median(recent.map((a) => a.subscription)) : null,
    medianSubscriptionAllTime: median(all.map((a) => a.subscription)),
    undersubscribed: recent.filter((a) => a.subscription < 1).length,
    totalAuctions: all.length,
  };
}
