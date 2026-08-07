export type BondCategory = 'FXD' | 'IFB' | 'SDB' | 'TBILL';

export interface Bond {
  isin: string;
  issueCode: string;        // e.g. FXD1/2024/10
  name: string;
  category: BondCategory;
  issueDate: string;        // ISO date
  maturityDate: string;     // ISO date
  tenorYears: number;
  couponRate: number;       // % p.a., e.g. 16.0
  couponFrequencyPerYear: number; // typically 2
  /** Gross yield at this bond's MOST RECENT AUCTION — not a live market yield.
   *
   *  The comment here used to read "latest gross YTM %", which is true only if
   *  "latest" is read as "the last time anyone auctioned this bond". A bond is
   *  auctioned when the government wants to borrow at that tenor, so on the
   *  shipped data these range from ten days old to nine years, and the reader
   *  of a chart built from them has no way to tell which. Anything presenting
   *  this as current has to say how old it is — see YieldCurveChart. */
  ytmGross: number;
  /** The value date of the auction `ytmGross` came from. Absent on bonds seeded
   *  before the archive existed, which is why staleness checks must treat a
   *  missing date as unknown rather than as fresh. */
  ytmAsOf?: string;
  minInvestmentKES: number;
  taxExempt: boolean;       // IFBs are WHT-exempt
}

export interface AuctionSchedule {
  id: string;
  issueCode: string;
  bondName: string;
  category: BondCategory;
  offerOpenDate: string;
  offerCloseDate: string;
  auctionDate: string;
  settlementDate: string;
  // Null when the prospectus states no amount — CBK's current documents
  // don't. Zero would be a claim that nothing is on offer, which is a
  // different fact entirely, and formatCompactKES renders null as a dash.
  amountOfferedKES: number | null;
  couponRate: number | null; // null = market determined
  tenorYears: number;
  // Null when a scraped record could not read one; the code still names the
  // bond. Present on bonds.json always, so calculations are unaffected.
  maturityDate?: string | null;
  prospectusUrl: string;
  status: 'upcoming' | 'open' | 'closed' | 'settled';
}

export interface Holding {
  id: string;
  isin: string;
  issueCode: string;
  faceValueKES: number;
  purchaseDate: string;
  purchaseCleanPrice: number; // per 100
  /**
   * Whether `purchaseCleanPrice` is a reading or a placeholder.
   *
   * A DhowCSD export is a custody statement: it says what is held, never what
   * was paid for it. Absent this flag the placeholder par price is
   * indistinguishable from a real one, and every return figure derived from it
   * would be presented to a reader as a fact about their own money.
   *
   * Undefined means known, so holdings typed into the template keep working
   * unchanged.
   */
  costBasisKnown?: boolean;
  /** Units pledged, banned or disputed — held, but not freely sellable. */
  encumberedQuantity?: number;
}

export interface MacroIndicator {
  id: string;
  indicator: 'CBR' | 'CPI' | 'CPI_CORE' | 'CPI_NONCORE' | 'GDP' | 'FX_USD_KES';
  value: number;
  date: string;
  unit: string;
  source: string;
  /** Set when a substitute source stood in for the authoritative one. */
  fallback?: boolean;
  /** When the value was last CONFIRMED, as distinct from when it changed. */
  lastChecked?: string;
  /**
   * Which month a monthly statistic DESCRIBES, as YYYY-MM — not when we read
   * it. A CPI print scraped on 5 August reports July, and dating it to August
   * overstates by a month on the one card whose job is saying how current a
   * number is. Absent for figures where the two coincide, like a daily rate.
   */
  period?: string;
  /** When we last TRIED, whether or not it worked. See carry_forward. */
  lastAttempt?: string;
  /**
   * Why the last attempt produced nothing, naming each route tried.
   *
   * Its presence beside a missing `lastChecked` is the readable form of "we
   * are still asking and still not getting an answer" — the state USD/KES was
   * in for seventeen days while looking identical to a healthy figure.
   */
  attemptFailed?: string;
  /**
   * Which declared route actually produced this figure — see
   * backend/scrapers/sources.py.
   *
   * `fallback` says a substitute stood in; this says WHICH one, which is the
   * difference between knowing the primary source broke and knowing what to go
   * and fix. A record that quietly arrives via a fallback for weeks looks
   * identical to a healthy one without it.
   */
  via?: string;
}

export interface RateDecision {
  id: string;
  date: string;             // ISO date of the MPC decision
  rate: number;             // CBR set at that meeting, %
  title: string;            // CBK's own headline
  url: string;              // the press release itself
  move: 'start' | 'cut' | 'hike' | 'hold';
  changeBps: number;        // vs the previous decision; computed, not parsed
}

/**
 * One bond's line in one published CBK auction result. The archive accumulates
 * — a print from 2021 is as true today as it was then — so these build up into
 * a per-bond yield history. Every field beyond the identity is optional because
 * CBK's own tables omit columns from one result sheet to the next.
 */
export interface AuctionPrint {
  id: string;
  issueCode: string;
  auctionDate: string;
  couponRate?: number;
  weightedAverageRate?: number;        // accepted bids — what buyers actually got
  marketWeightedAverageRate?: number;  // all bids, accepted or not
  pricePer100?: number;
  amountOfferedKESM?: number;          // per AUCTION, which may cover several bonds
  amountAcceptedKESM?: number;
  bidsReceivedKESM?: number;
  // The row label the bids figure came from. It carries the BASIS: a tap sale
  // may state bids at face value while acceptance is at cost, 1-2% apart, so
  // the two are not always comparable and this is how you tell.
  bidsLabel?: string;
  sourceUrl?: string;
}

export interface SecondaryTrade {
  isin: string;
  tradeDate: string;
  price: number;    // clean price
  yield: number;    // gross YTM
  volumeKES: number;
  tradesCount: number;
}

export interface TBill {
  id: string;
  tenorDays: 91 | 182 | 364;
  discountRate: number;      // quoted weighted average rate, % p.a.
  auctionDate: string;
  nextAuctionDate: string;
  amountOfferedKES: number;
  amountAcceptedKES: number;
  minInvestmentKES: number;
  source: string;
}

export interface ContextIndicator {
  id: string;
  label: string;
  value: number;
  unit: string;
  asOf: string;
  source: string;
  sourceUrl: string;
  note: string;
  sentiment: 'good' | 'caution' | 'watch';
}

export interface DataBundle {
  bonds: Bond[];
  auctions: AuctionSchedule[];
  macro: MacroIndicator[];
  secondary: SecondaryTrade[];
  generatedAt: string;
}
