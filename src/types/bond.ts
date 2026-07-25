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

export interface DataBundle {
  bonds: Bond[];
  auctions: AuctionSchedule[];
  macro: MacroIndicator[];
  secondary: SecondaryTrade[];
  generatedAt: string;
}
