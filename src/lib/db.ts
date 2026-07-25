import Dexie, { type Table } from 'dexie';
import type { Bond, AuctionSchedule, Holding, MacroIndicator, SecondaryTrade, TBill } from '@/types/bond';

class MwangazaDB extends Dexie {
  bonds!: Table<Bond, string>;
  auctions!: Table<AuctionSchedule, string>;
  holdings!: Table<Holding, string>;
  macro!: Table<MacroIndicator, string>;
  secondary!: Table<SecondaryTrade, [string, string]>;
  tbills!: Table<TBill, string>;

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
  }
}

export const db = new MwangazaDB();
