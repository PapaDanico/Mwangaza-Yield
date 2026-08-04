/**
 * What a bond has actually cleared at, auction after auction.
 *
 * The app already answers "what does this bond pay?". It has never answered the
 * question every investor asks immediately afterwards — **"is that good?"** — and
 * without an answer the first number is hard to act on. A 13.3% yield means
 * nothing on its own; 13.3% when the same bond cleared at 12.3% three months ago
 * means the government is paying more to borrow, and you are being offered a
 * better deal than the last person was.
 *
 * The material for that answer arrived when the auction parser started keeping
 * every result it had ever read instead of replacing them. This file turns that
 * accumulating archive into a per-bond history.
 *
 * TWO DELIBERATE REFUSALS
 * -----------------------
 * 1. **No history from a single print.** One auction is a point, not a path.
 *    Drawing a "trend" through one dot invites a reader to see direction that
 *    was never measured, so `summarise` returns null below two points.
 * 2. **No subscription ratio.** CBK publishes the amount offered per *auction*
 *    and the bids received per *bond*, and one auction routinely covers two or
 *    three bonds. Dividing one by the other would produce a confident,
 *    meaningless number. The yield path is measured per bond and is the honest
 *    thing to show.
 */
import type { AuctionPrint } from '../types/bond';

// The tenor is usually a whole number of years and is NOT always one: CBK
// issued IFB1/2023/6.5 and IFB1/2024/8.5. A pattern of `\d+` matches those as
// "6" and "8", which quietly points two tax-free infrastructure bonds at the
// wrong history.
const CODE_RE = /^([A-Z]+\d*)\/(\d{4})\/(\d{1,3}(?:\.\d+)?)$/;

/**
 * `FXD1/2022/10` and `FXD1/2022/010` are the same bond.
 *
 * CBK writes the tenor unpadded for humans and zero-padded in its result files,
 * and our own two datasets inherited both spellings — bonds.json carries the
 * display form, auction-results.json the padded one. Matching on the raw string
 * silently finds nothing, which would show every bond as having no history at
 * all while looking like it worked.
 */
export function normaliseCode(code: string): string {
  const m = CODE_RE.exec(code.trim().toUpperCase().replace(/\s+/g, ''));
  if (!m) return code.trim().toUpperCase();
  // Pad the whole-year part; keep any fraction exactly as issued, since
  // rounding it would merge a 6.5-year bond with a 6-year one.
  const [whole, frac] = m[3].split('.');
  return `${m[1]}/${m[2]}/${whole.padStart(3, '0')}${frac ? `.${frac}` : ''}`;
}

/**
 * What kind of transaction the document describes.
 *
 * Not every result CBK publishes is a sale of bonds to investors. A BUYBACK is
 * the Treasury on the other side: it is buying its own paper back from holders
 * who want out, ahead of maturity. A SWITCH offers holders of one bond an
 * exchange into another, so there is still a bond being taken up.
 *
 * Derived from the document name, which states it — "FEBRUARY BUYBACK AUCTION
 * FXD1-2022-003 ... DATED 17-02-2025" — because nothing inside the parsed
 * fields distinguishes them and the parser has no reason to.
 */
export type AuctionKind = 'issuance' | 'tap' | 'switch' | 'buyback';

export function auctionKind(print: AuctionPrint): AuctionKind {
  const name = (print.sourceUrl ?? '').toUpperCase();
  if (/BUY\s*-?\s*BACK/.test(name)) return 'buyback';
  if (name.includes('SWITCH')) return 'switch';
  /* Letter boundaries, not a bare `includes`. "ADAPTATION" contains TAP, so a
   * green ADAPTATION bond would be filed as a tap sale and dropped from the
   * only statistic that counts real auctions. CBK also writes "TAPSALE" as one
   * word about as often as "TAP SALE", and \b never fires beside the numeric
   * id and underscore CBK prefixes to these filenames — "838376338_TAP SALE
   * RESULTS" — so the boundary has to be a letter test, and the trailing side
   * must allow SALE specifically and nothing else.
   *
   * No ADAPTATION bond is in the archive today, so this is a latent trap
   * rather than a live defect; the reasoning was already worked out and
   * written down in auction-review.ts and is simply applied here. Both failure
   * directions are tested. */
  if (/(?<![A-Z])TAP(?:SALE)?(?![A-Z])/.test(name)) return 'tap';
  return 'issuance';
}

/**
 * The rate the auction settled at, or null when the document is not a sale.
 *
 * CBK reports a weighted average of accepted bids and, separately, a market
 * weighted average across all bids; the first is what buyers actually got, so
 * it wins. The coupon is never used as a fallback — it is what the bond
 * promises, not what the auction decided, and substituting one for the other
 * would draw a flat line through a moving market.
 *
 * BUYBACKS ARE REFUSED, and the reason is a sign flip.
 * ---------------------------------------------------
 * In a sale the Treasury accepts the LOWEST yields, because a low yield is
 * cheap borrowing — so the accepted average sits below the all-bids average.
 * In a buyback the Treasury is the buyer, so it accepts the HIGHEST yields,
 * which are the lowest prices, and the accepted average sits ABOVE.
 *
 * That is exactly what the archive shows. Correcting the accepted-vs-market
 * confusion moved 129 records; 125 fell and four rose, and the four that rose
 * are precisely the four buybacks. The anomaly turned out to be the Treasury
 * standing on the other side of the trade.
 *
 * A buyback rate is what the government paid to retire debt from willing
 * sellers. It is not a rate any buyer could have obtained, and it was sitting
 * in per-bond yield histories as though it were — on three of those four
 * bonds it was the MOST RECENT point, which is the one a reader anchors on.
 *
 * Taps and switches stay: in both, an investor is taking up a bond at a price
 * the auction set.
 */
export function clearingRate(print: AuctionPrint): number | null {
  if (auctionKind(print) === 'buyback') return null;
  return print.weightedAverageRate ?? print.marketWeightedAverageRate ?? null;
}

export interface AuctionPoint {
  date: string;
  rate: number;
  pricePer100?: number;
  sourceUrl?: string;
}

/** Every print for one bond that carries a clearing rate, oldest first. */
export function historyFor(prints: AuctionPrint[], issueCode: string): AuctionPoint[] {
  const want = normaliseCode(issueCode);
  const byDate = new Map<string, AuctionPoint>();

  for (const p of prints) {
    if (normaliseCode(p.issueCode) !== want) continue;
    const rate = clearingRate(p);
    if (rate == null || !p.auctionDate) continue;
    // Two files can report the same auction — a tap sale alongside the main
    // sale. Keep one point per date so the chart cannot show a vertical jump
    // between two spellings of the same event.
    if (!byDate.has(p.auctionDate)) {
      byDate.set(p.auctionDate, {
        date: p.auctionDate,
        rate,
        pricePer100: p.pricePer100,
        sourceUrl: p.sourceUrl,
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface AuctionHistory {
  points: AuctionPoint[];
  latest: AuctionPoint;
  previous: AuctionPoint | null;
  /** Latest versus the print before it. Null when there is only one prior. */
  changeBps: number | null;
  high: AuctionPoint;
  low: AuctionPoint;
  /** Where the latest sits inside its own range, 0 (cheapest) to 1 (dearest). */
  position: number;
}

export function summarise(points: AuctionPoint[]): AuctionHistory | null {
  if (points.length < 2) return null; // see refusal (1) in the module docstring

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  let high = points[0];
  let low = points[0];
  for (const p of points) {
    if (p.rate > high.rate) high = p;
    if (p.rate < low.rate) low = p;
  }

  const span = high.rate - low.rate;
  return {
    points,
    latest,
    previous,
    changeBps: Math.round((latest.rate - previous.rate) * 100),
    high,
    low,
    // A flat history has no meaningful position within itself. Calling it the
    // midpoint says "typical", which is true and avoids a divide by zero.
    position: span === 0 ? 0.5 : (latest.rate - low.rate) / span,
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthYear(iso: string): string {
  const [y, m] = iso.split('-');
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : iso;
}

/**
 * The history in a sentence, written for someone who has never used the word
 * "clearing yield" and does not need to start now.
 */
export function describeHistory(h: AuctionHistory): string {
  const times = h.points.length === 2 ? 'twice' : `${h.points.length} times`;
  const since = monthYear(h.points[0].date);
  const bps = h.changeBps ?? 0;

  const versusLast =
    bps === 0
      ? 'the same rate as the time before'
      : `${(Math.abs(bps) / 100).toFixed(2)} percentage points ${bps > 0 ? 'more' : 'less'} than the time before`;

  return (
    `This bond has been sold at auction ${times} since ${since}. ` +
    `Buyers of the most recent one earned ${h.latest.rate.toFixed(2)}% a year — ${versusLast}.`
  );
}

/**
 * Whether today's offer is generous or mean *by this bond's own standards* —
 * the comparison that needs no other bond, no benchmark and no jargon.
 */
export function readAgainstOwnRange(h: AuctionHistory): string {
  const range = `${h.low.rate.toFixed(2)}% to ${h.high.rate.toFixed(2)}%`;

  // With exactly two auctions the latest is ALWAYS the highest or the lowest
  // this bond has ever paid — arithmetic, not information. Saying "near the top
  // of everything this bond has ever paid" there sounds like a finding and is
  // guaranteed, which is precisely the kind of confident emptiness this app is
  // supposed to avoid. Two points support a direction and nothing more.
  if (h.points.length < 3) {
    const bps = h.changeBps ?? 0;
    if (bps === 0) {
      return `Both auctions cleared at ${h.latest.rate.toFixed(2)}%. Two sales are too few to call a range.`;
    }
    return (
      `Only two auctions of this bond have been published, so there is not yet a range ` +
      `to judge against — only a direction: ${bps > 0 ? 'up' : 'down'} from ` +
      `${h.previous!.rate.toFixed(2)}% to ${h.latest.rate.toFixed(2)}%.`
    );
  }

  if (h.high.rate - h.low.rate < 0.25) {
    return (
      `Every auction of this bond has landed within a whisker of the others (${range}), ` +
      `so there has been little advantage in waiting for a better one.`
    );
  }
  if (h.position >= 0.75) {
    return (
      `That is near the top of everything this bond has ever paid (${range}). ` +
      `Lenders are asking the government for more than usual — which, if you are the lender, ` +
      `is the side of the bargain you want to be on.`
    );
  }
  if (h.position <= 0.25) {
    return (
      `That is near the bottom of everything this bond has ever paid (${range}). ` +
      `Demand has been strong, so the government has not had to offer much. ` +
      `Worth weighing against what else is available before committing.`
    );
  }
  return (
    `That sits in the middle of its own history (${range}) — neither an unusually ` +
    `generous auction nor a disappointing one.`
  );
}
