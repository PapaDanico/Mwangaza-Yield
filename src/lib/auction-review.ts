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
 * published results for February 2026 show Ksh 213.7bn of bids against a
 * Ksh 50bn target: 427%. April 2026 drew Ksh 74.89bn against Ksh 40bn. Kenyan
 * auctions are persistently OVERSUBSCRIBED and have been for years.
 *
 * The cause was arithmetic, not the market. Bids are parsed PER BOND; the
 * offered amount is stored for the WHOLE AUCTION. February 2026 has 50,000
 * offered on one row and 133,792 bid on another, with the auction's remaining
 * bond blank. Dividing one bond's bids by the entire auction's target
 * understates cover by roughly the number of bonds on offer — which is exactly
 * how every month came out below 1.0x.
 *
 * `bidsComplete` below refuses the ratio unless every row in the auction
 * carries its bids figure. That was necessary and it was not sufficient:
 * nothing in the archive said whether an auction had been captured in FULL, so
 * a genuinely single-bond auction was indistinguishable from a three-bond
 * auction whose other two rows were never parsed.
 *
 * WHERE THAT STANDS NOW
 * ---------------------
 * The parser reads every bond of a multi-bond auction. The cause of the
 * shortfall was an unlabelled auction-TOTAL column that the header never names;
 * it collided with the last bond's cell and destroyed it, so the second leg of
 * every multi-bond auction came back empty. February 2026 now reads 133,792.51
 * and 79,943.37 against a shared 50,000 — 4.27x, matching the 427% CBK
 * published — and April 2026 sums to 74,891.22 against the 74.89bn reported.
 *
 * A SECOND trap surfaced while checking that, and it is why this is still not
 * published. Not every row in the archive is an auction in the sense a cover
 * ratio assumes. Switch auctions are debt EXCHANGES that raise no cash, and
 * they sit in the archive at 0.82x and 0.13x — figures that read as failed
 * auctions when nothing failed. Tap sales are fixed-price top-ups where
 * under-filling is routine. `auctionKind` separates them, and only primary
 * auctions now produce a ratio.
 *
 * On primary auctions alone, restricted to rows the current parser has
 * re-read, the archive says: 2021 1.58x, 2022 0.89x, 2023 1.00x, 2024 1.39x,
 * 2025 1.88x, 2026 1.87x. Kenyan auctions ARE persistently oversubscribed now —
 * 2024 to 2026 runs 35 of 41 above 1x — and were genuinely weak through the
 * 2022-23 fiscal squeeze. Both halves of that are worth publishing and neither
 * was visible before.
 *
 * It stays unpublished until the archive is fully re-read at the current parser
 * version, because a median taken mid-rebuild mixes two parsers' output. The
 * lesson is the cheap one to write down and the expensive one to learn: a
 * number that disagrees with everyone who follows the market is not a
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

/**
 * The parser version the archive must be uniform at before any figure here is
 * fit to publish.
 *
 * Mirrors PARSER_VERSION in backend/scrapers/auction_results.py. Records are
 * never re-derived once written, so a bump makes older rows stale until the
 * next run re-reads them — and a median taken mid-rebuild mixes two parsers'
 * output, which is exactly the mistake the header of this file records.
 */
export const REQUIRED_PARSER_VERSION = 14;

/**
 * Whether the archive is uniform enough for these figures to be published.
 *
 * WHY THIS IS CODE AND NOT A SENTENCE
 * -----------------------------------
 * The gate used to live only in this file's header — "stays unpublished until
 * the archive is fully re-read at the current parser version" — and a prose
 * gate has two failure modes. It cannot be checked automatically, so nobody
 * notices when it clears; and it cannot be checked at all, so nobody notices
 * when it CANNOT clear.
 *
 * The second is what actually happened. Three records sat at parser versions 5
 * and 7 against 387 at 14, and they are not stragglers waiting their turn:
 * their sourceUrl points at `/images/docs/Treasury Bond Results/`, the legacy
 * 2016-era path that DATA-SOURCES.md §15 records as stale. The incremental
 * parser walks the LIVE listing under `/uploads/`, so it will never encounter
 * those three files again. They can never be re-read, so a gate demanding
 * uniformity across every row would have blocked this module permanently while
 * looking like it was waiting for something.
 *
 * So the requirement is stated as what it actually needs to be: every row that
 * this module could USE must be current. An undated row contributes to no
 * month and is excluded from every figure here anyway — demanding it be
 * re-parsed is demanding a rebuild that changes no output.
 */
export function archiveIsPublishable(prints: AuctionPrint[]): {
  ok: boolean;
  usable: number;
  stale: number;
  /** Rows excluded as unusable regardless of version, for the count to add up. */
  unusable: number;
} {
  let usable = 0;
  let stale = 0;
  let unusable = 0;
  for (const p of prints) {
    // Undated rows reach no month, so their parser version cannot affect any
    // figure this module produces.
    if (!p.auctionDate) {
      unusable += 1;
      continue;
    }
    usable += 1;
    if ((p as { parserVersion?: number }).parserVersion !== REQUIRED_PARSER_VERSION) {
      stale += 1;
    }
  }
  return { ok: usable > 0 && stale === 0, usable, stale, unusable };
}

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
  /** Primary auction, tap sale, or switch. Only primary carries a cover ratio. */
  kind: AuctionKind;
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

export type AuctionKind = 'primary' | 'tap' | 'switch';

/**
 * What kind of sale this was, read from the name CBK gave the results file.
 *
 * Not decoration — a cover ratio means a different thing in each, and pooling
 * them produces a number that describes nothing.
 *
 * A SWITCH is a debt exchange: holders of a maturing bond swap into a longer
 * one, and no cash is raised. "Bids" are the paper offered for exchange, so
 * dividing them by the target measures participation in a restructuring, not
 * appetite for Kenyan government debt. The archive's switch auctions run around
 * 0.8x and one reads 0.13x — figures that would appear in a review as failed
 * auctions when nothing failed at all.
 *
 * A TAP SALE is a follow-on offer of a bond already sold at auction, opened at
 * a fixed price and closed when it fills. Under-filling is routine and is not a
 * verdict on demand.
 *
 * Only PRIMARY auctions and re-openings put a new target to the market and get
 * an answer, and only their cover ratios belong in the same statistic.
 *
 * Read from the filename because that is where CBK states it — "SWITCH RESULTS
 * FXD1-2018-015 DATED 15-04-2026", "TAP SALE RESULTS IFB1-2022-14". The
 * document body says the same thing in prose that varies far more.
 */
export function auctionKind(sourceUrl?: string): AuctionKind {
  if (!sourceUrl) return 'primary';
  let name = sourceUrl;
  try {
    name = decodeURIComponent(sourceUrl);
  } catch {
    /* a malformed escape is not a reason to misclassify — use the raw name */
  }
  const upper = name.toUpperCase();
  if (upper.includes('SWITCH')) return 'switch';
  // Letter boundaries, not \b. CBK prefixes these files with a numeric id and
  // an underscore — "838376338_TAP SALE RESULTS" — and `_` is a WORD character,
  // so \b never fires beside it and the tap went unrecognised. The parser's date
  // pattern carries the same scar.
  //
  // But a boundary on BOTH sides was too strict, and the first version of this
  // shipped with that fault: CBK writes "TAPSALE" as one word about as often as
  // "TAP SALE" — seven files in the archive, ten records — and every one of them
  // was filed as a primary auction. Nothing wrong reached a reader, but only by
  // luck: those files parse so poorly that the completeness guard rejected them
  // before any ratio was computed. Fixing the tap-sale table layout would have
  // silently switched them on.
  //
  // So the trailing boundary allows SALE specifically, and nothing else. A bare
  // `includes` would file a green ADAPTATION bond as a tap sale and drop a real
  // auction out of the only statistic that counts them; allowing any following
  // letters would do the same. Both failure directions are tested.
  if (/(?<![A-Z])TAP(?:SALE)?(?![A-Z])/.test(upper)) return 'tap';
  return 'primary';
}

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

  // A switch is an exchange and a tap is a fixed-price top-up. Neither puts a
  // new target to the market, so neither produces a cover ratio that belongs
  // beside a primary auction's. The figures are still reported on the row —
  // they are real and they are CBK's — but no ratio is computed from them,
  // because a ratio is a claim about demand and these cannot make one.
  const kind = auctionKind(group.find((p) => p.sourceUrl)?.sourceUrl);

  let bidToCover: number | undefined;
  let coverRejected = false;
  if (kind === 'primary' && offeredKESM && bidsKESM && bidsComplete) {
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
    kind,
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
