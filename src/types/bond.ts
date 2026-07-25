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
  ytmGross: number;         // latest gross YTM %
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
  amountOfferedKES: number;
  couponRate: number | null; // null = market determined
  tenorYears: number;
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
}

export interface MacroIndicator {
  id: string;
  indicator: 'CBR' | 'CPI' | 'GDP' | 'FX_USD_KES';
  value: number;
  date: string;
  unit: string;
  source: string;
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
