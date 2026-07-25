/**
 * The monthly auction review: what the government asked for, what the market
 * offered, and what it actually got.
 *
 * NOT PUBLISHED. NOT YET FIT TO PUBLISH.
 * ======================================
 * This module is correct and tested. The ARCHIVE UNDERNEATH IT IS NOT SOUND
 * ENOUGH to put these figures in front of a reader, and the difference nearly
 * shipped as a research note.
 *
 * What happened, recorded so it is not repeated. A first version of this file
 * computed bid-to-cover for every month in the archive and reported that
 * Kenyan bond auctions were persistently UNDERSUBSCRIBED — medians of 0.5x to
 * 0.8x, month after month. That is the opposite of the truth. CBK's own
 * published results for February 2026 show KES 213.7bn of bids against a
 * KES 50bn target: 427%. April 2026 drew KES 74.89bn against KES 40bn. Kenyan
 * auctions are persistently OVERSUBSCRIBED and have been for years.
 *
 * The cause was arithmetic, not the market. Bids are parsed PER BOND; the
 * offered amount is stored for the WHOLE AUCTION. February 2026 has 50,000
 * offered on one row and 133,792 bid on another, with the auction's remaining
 * bond blank. Dividing one bond's bids by the entire auction's target
 * understates cover by roughly the number of bonds on offer — which is exactly
 * how every month came out below 1.0x.
 *
 * `bidsComplete` below now refuses the ratio unless every row in the auction
 * carries its bids figure, which lifts the archive-wide median to 1.04x with a
 * maximum of 4.12x — consistent with the published record. It is still not
 * enough. Nothing in the archive says whether an auction was captured in FULL,
 * so a genuinely single-bond auction is indistinguishable from a three-bond
 * auction whose other two rows were never parsed. Uptake has the same flaw for
 * the same reason.
 *
 * So the page this fed was withdrawn before release. It stays here, tested,
 * until the parser captures every bond of an auction or records that it could
 * not. The lesson is the cheap one to write down and the expensive one to
 * learn: a number that disagrees with everyone who follows the market is not a
 * discovery, it is a bug, and the first move is to check it against them.
 *
 * This is computation, not commentary. Every figure is derived from CBK's own
 * published auction results and can be checked against the PDF each row links
 * to. Nothing here recommends a course of action, and nothing here is a
 * forecast — those are both lines this project does not cross.
 *
 * TWO TRAPS IN THE UNDERLYING DATA, HANDLED HERE
 * ----------------------------------------------
 * 1. `amountOfferedKESM` is per AUCTION, not per bond. A three-bond auction
 *    stores the same offered total against all three rows — verified: 81 of the
 *    97 multi-bond dates in the archive repeat one figure. Summing it across
 *    rows would multiply the government's borrowing target by the number of
 *    bonds on offer, and would do it silently. So the offered amount is taken
 *    ONCE PER DATE.
 *
 * 2. Some `bidsReceivedKESM` values are the offered amount in BILLIONS while
 *    `amountOfferedKESM` is in millions — 30000.0 against 30.0, the same number
 *    a thousand apart. Twenty-four rows in the archive carry this, a parser
 *    fault rather than a market event. A bid-to-cover of 0.001 is not a story
 *    about weak demand, it is a story about a misread column, and publishing it
 *    as the former would be worse than publishing nothing.
 *
 * So a cover ratio outside PLAUSIBLE_COVER is discarded and counted as
 * excluded rather than reported. The review then states its own evidence base —
 * how many auctions it saw, and how many of them it could actually measure.
 * A note that says "three auctions, two measurable" is worth more than one that
 * quietly averages the two and calls it the month.
 */
import type { AuctionPrint } from '@/types/bond';

/**
 * The band a real Kenyan bond auction lands in. Undersubscription happens —
 * covers below 1 are common and newsworthy — but a ratio of 0.001 or 400 is
 * arithmetic on a misparsed column, not a market that did something strange.
 * Deliberately wide: the job here is to exclude the impossible, not to tidy
 * away the merely surprising.
 */
export const PLAUSIBLE_COVER: [number, number] = [0.1, 10];

export interface AuctionRow {
  date: string;
  issueCodes: string[];
  offeredKESM?: number;
  acceptedKESM?: number;
  bidsKESM?: number;
  /** Bids received ÷ amount offered. Absent when it could not be trusted. */
  bidToCover?: number;
  /** Accepted ÷ offered — did the Treasury raise what it set out to raise. */
  uptakePct?: number;
  /** True when both figures were present but their ratio was impossible. */
  coverRejected: boolean;
  sourceUrl?: string;
}

export interface MonthlyReview {
  month: string;
  label: string;
  rows: AuctionRow[];
  auctionCount: number;
  /** Auctions that produced a usable cover ratio. The review's evidence base. */
  measured: number;
  /** Auctions whose cover ratio was present but rejected as implausible. */
  rejected: number;
  medianCover?: number;
  totalOfferedKESM?: number;
  totalAcceptedKESM?: number;
  uptakePct?: number;
  /** Median cover over the preceding months, for context rather than a trend. */
  priorMedianCover?: number;
  priorMonthsCounted: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${y}` : month;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : undefined;

function plausible(cover: number): boolean {
  return cover >= PLAUSIBLE_COVER[0] && cover <= PLAUSIBLE_COVER[1];
}

/** Months present in the archive, newest first. */
export function availableMonths(prints: AuctionPrint[]): string[] {
  const set = new Set<string>();
  for (const p of prints) if (p.auctionDate) set.add(p.auctionDate.slice(0, 7));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/** Collapse one auction date's rows into a single auction. */
function toRow(date: string, group: AuctionPrint[]): AuctionRow {
  // Offered is per auction: take one value, never a sum. Where rows disagree
  // (one date in the archive does), the largest is the auction total — a
  // smaller figure on a sibling row is a partial read, not a second auction.
  const offered = group.map((p) => num(p.amountOfferedKESM)).filter((v): v is number => v !== undefined);
  const offeredKESM = offered.length ? Math.max(...offered) : undefined;

  // Accepted and bids ARE per row where present, so they sum. Where only one
  // row of a multi-bond auction was parsed the total is understated — which is
  // why uptake is reported beside the raw figures rather than instead of them.
  const sum = (f: 'amountAcceptedKESM' | 'bidsReceivedKESM') => {
    const vals = group.map((p) => num(p[f])).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
  };
  const acceptedKESM = sum('amountAcceptedKESM');
  const bidsKESM = sum('bidsReceivedKESM');

  // Bids are parsed PER BOND; the offered amount is for the WHOLE auction. If
  // any bond in the auction is missing its bids figure, the numerator covers
  // part of the auction and the denominator covers all of it, and the ratio is
  // wrong by roughly the number of bonds on offer.
  //
  // This is not hypothetical. February 2026 stores 50,000 offered against one
  // row and 133,792 bid against another, with the auction's other bond blank.
  // That divides to 2.68x; CBK published 213.7bn of bids against a 50bn target,
  // which is 4.27x. Every month this file produced came out under 1.0x, and
  // Kenyan auctions are in fact persistently oversubscribed — the ratio was an
  // artefact of a partial numerator, not a fact about demand.
  //
  // The same reasoning already guarded uptakePct below. It should always have
  // guarded this.
  const bidsComplete = group.length > 0 && group.every((p) => num(p.bidsReceivedKESM) !== undefined);

  let bidToCover: number | undefined;
  let coverRejected = false;
  if (offeredKESM && bidsKESM && bidsComplete) {
    const c = bidsKESM / offeredKESM;
    if (plausible(c)) bidToCover = c;
    else coverRejected = true;
  }

  return {
    date,
    issueCodes: Array.from(new Set(group.map((p) => p.issueCode))).sort(),
    offeredKESM,
    acceptedKESM,
    bidsKESM,
    bidToCover,
    uptakePct:
      offeredKESM && acceptedKESM ? (acceptedKESM / offeredKESM) * 100 : undefined,
    coverRejected,
    sourceUrl: group.find((p) => p.sourceUrl)?.sourceUrl,
  };
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function rowsForMonth(prints: AuctionPrint[], month: string): AuctionRow[] {
  const byDate = new Map<string, AuctionPrint[]>();
  for (const p of prints) {
    if (!p.auctionDate || p.auctionDate.slice(0, 7) !== month) continue;
    const key = p.auctionDate.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), p]);
  }
  return Array.from(byDate.entries())
    .map(([date, group]) => toRow(date, group))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Build the review for one month.
 *
 * `priorMonths` sets how far back the comparison median reaches. It is a
 * comparison, not a trend: three auctions against a six-month median says
 * something; three auctions against a fitted line says more than the data can
 * support.
 */
export function buildMonthlyReview(
  prints: AuctionPrint[],
  month: string,
  priorMonths = 6
): MonthlyReview {
  const rows = rowsForMonth(prints, month);
  const covers = rows.map((r) => r.bidToCover).filter((v): v is number => v !== undefined);

  // Prior window, exclusive of the month under review.
  const priorKeys = availableMonths(prints).filter((m) => m < month).slice(0, priorMonths);
  const priorCovers = priorKeys
    .flatMap((m) => rowsForMonth(prints, m))
    .map((r) => r.bidToCover)
    .filter((v): v is number => v !== undefined);

  const offeredTotals = rows.map((r) => r.offeredKESM).filter((v): v is number => v !== undefined);
  const acceptedTotals = rows.map((r) => r.acceptedKESM).filter((v): v is number => v !== undefined);
  const totalOfferedKESM = offeredTotals.length
    ? offeredTotals.reduce((a, b) => a + b, 0)
    : undefined;
  const totalAcceptedKESM = acceptedTotals.length
    ? acceptedTotals.reduce((a, b) => a + b, 0)
    : undefined;

  return {
    month,
    label: monthLabel(month),
    rows,
    auctionCount: rows.length,
    measured: covers.length,
    rejected: rows.filter((r) => r.coverRejected).length,
    medianCover: median(covers),
    totalOfferedKESM,
    totalAcceptedKESM,
    // Only meaningful when every auction that month reported both sides;
    // otherwise it is a ratio between a full numerator and a partial one.
    uptakePct:
      totalOfferedKESM && totalAcceptedKESM && offeredTotals.length === rows.length
        ? (totalAcceptedKESM / totalOfferedKESM) * 100
        : undefined,
    priorMedianCover: median(priorCovers),
    priorMonthsCounted: priorKeys.length,
  };
}

/**
 * One sentence stating what the review is built on, for printing at the top of
 * the note. A reader should never have to work out the evidence base from a
 * table, and a month with nothing measurable should say so in words.
 */
export function evidenceLine(r: MonthlyReview): string {
  if (!r.auctionCount) return `No auction results recorded for ${r.label}.`;
  const a = `${r.auctionCount} auction${r.auctionCount === 1 ? '' : 's'}`;
  if (!r.measured) {
    return `${a} in ${r.label}. None carried figures complete enough to measure demand.`;
  }
  const base = `${a} in ${r.label}, ${r.measured} with demand figures complete enough to measure`;
  return r.rejected
    ? `${base}. ${r.rejected} discarded as unreadable rather than reported.`
    : `${base}.`;
}
