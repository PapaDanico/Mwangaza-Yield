import Dexie, { type Table } from 'dexie';
import type { Bond, AuctionSchedule, AuctionPrint, Holding, MacroIndicator, SecondaryTrade, TBill, RateDecision } from '@/types/bond';
import type { SavedPlan } from './plans';

class MwangazaDB extends Dexie {
  bonds!: Table<Bond, string>;
  auctions!: Table<AuctionSchedule, string>;
  holdings!: Table<Holding, string>;
  macro!: Table<MacroIndicator, string>;
  secondary!: Table<SecondaryTrade, [string, string]>;
  tbills!: Table<TBill, string>;
  plans!: Table<SavedPlan, string>;
  cbrHistory!: Table<RateDecision, string>;
  auctionResults!: Table<AuctionPrint, string>;

  constructor() {
    super('mwangaza-yield');
    this.version(2).stores({
      bonds: 'isin, issueCode, category, tenorYears',
      auctions: 'id, issueCode, offerCloseDate, status',
      holdings: 'id, isin, issueCode, purchaseDate',
      macro: 'id, indicator, date',
      secondary: '[isin+tradeDate], isin, tradeDate',
    });
    this.version(3).stores({
      tbills: 'id, tenorDays, auctionDate',
    });
    this.version(4).stores({
      plans: 'id, goal, updatedAt',
    });
    this.version(5).stores({
      cbrHistory: 'id, date',
    });
    this.version(6).stores({
      auctionResults: 'id, issueCode, auctionDate',
    });
  }
}

export const db = new MwangazaDB();
