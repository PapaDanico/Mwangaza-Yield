/**
 * Mwangaza Yield engine — the licensable surface.
 *
 * Everything a broker desk, SACCO, or wealth app needs to price Kenyan
 * government paper the way this app does, with none of the UI: one import,
 * pure functions, no I/O, no framework. This barrel IS the licence boundary —
 * if it is not exported here, it is not part of the product being sold, and
 * nothing behind it may reach for a browser, a store, or the network.
 *
 * The maths is the part that has been verified against the outside world: the
 * 364-day year and 182-day coupon convention derived from the CBK dataset and
 * independently confirmed by a real broker contract note, which the sell
 * evaluator reproduces to the cent (tests/unit/sell.test.ts). The bid guidance
 * carries its own two measured traps in src/lib/bid.ts.
 *
 * Build standalone with `npm run build:engine` → dist/engine (ESM + .d.ts).
 * Documentation: docs/ENGINE-API.md.
 */

// Core pricing and schedules — Kenyan conventions throughout.
export {
  YTM_CEILING,
  isYieldPinned,
  determineWHTRate,
  getCouponDates,
  getLastCouponDate,
  getNextCouponDate,
  calculateAccruedInterest,
  solveYTMFromPrice,
  computeBondInvestment,
  couponsByMonth,
  formatKES,
  formatPct,
  type InvestmentResult,
} from './financial-engine';

// Selling: reproduce a broker quote, expose what it does not say.
export {
  analyseSale,
  buildCashflows,
  remainingCouponDates,
  findReplacements,
  verdict,
  type AmortisationStep,
  type SaleQuote,
  type CashflowRow,
  type SaleAnalysis,
  type Replacement,
} from './sell';

// Auction bidding: clearing-rate history bucketed on remaining term.
export {
  GUIDANCE_FROM,
  MIN_SAMPLE,
  yearsToMaturityAt,
  findComparables,
  bidGuidance,
  readBid,
  demandByAuction,
  describeDemand,
  type ComparableAuction,
  type BidGuidance,
  type BidVerdict,
  type BidPosition,
  type AuctionDemand,
} from './bid';

// Recent-auction statistics: what the last year of auctions actually paid.
export {
  PULSE_WINDOW_DAYS,
  MIN_BUCKET_SAMPLE,
  recentClearingByTerm,
  demandPulse,
  type TermBucket,
  type DemandPulse,
} from './market-pulse';

// Auction archive utilities.
export { normaliseCode, clearingRate, historyFor, type AuctionPoint } from './auction-history';

// Price resolution with provenance: user > market > par, never silently.
export {
  resolvePrice,
  makePriceResolver,
  isPlausiblePrice,
  summarisePriceCoverage,
  describeProvenance,
  STALE_AFTER_DAYS,
  MIN_PRICE,
  MAX_PRICE,
  type UserPrice,
  type PriceSource,
  type ResolvedPrice,
} from './prices';

// Treasury bills.
export * from './tbills';

// The data contract the engine speaks.
export type { Bond, AuctionPrint, SecondaryTrade, TBill } from '../types/bond';
