import Dexie, { type Table } from 'dexie';
import type { Bond, AuctionSchedule, AuctionPrint, Holding, MacroIndicator, SecondaryTrade, TBill, RateDecision } from '@/types/bond';
import type { SavedPlan } from './plans';
import type { AlertRule } from './alerts';
import type { UserPrice } from './prices';

/**
 * A monthly CPI print as `cpi-history.json` ships it.
 *
 * `date` is the month the figure DESCRIBES; `fetchedAt` is when we last asked.
 * CBK's table lags a month, so a newest row dated last month is normal and
 * must not read as a stalled pipeline.
 */
export interface CpiPoint {
  id: string;
  indicator: 'CPI';
  value: number;
  date: string;
  unit: string;
  source: string;
  series: string;
  fetchedAt?: string;
}

/** One event we have already shown, so opening the app again does not repeat it. */
export interface AlertDelivery {
  id: string;       // the AlertEvent id
  deliveredAt: string;
  seen: boolean;    // false until the reader opens the alerts page
}

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
  alertRules!: Table<AlertRule, string>;
  alertLog!: Table<AlertDelivery, string>;
  /** Prices the reader looked up themselves. Never synced, never transmitted. */
  userPrices!: Table<UserPrice, string>;
  cpiHistory!: Table<CpiPoint, string>;

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
    this.version(7).stores({
      alertRules: 'id, kind, enabled',
      alertLog: 'id, deliveredAt, seen',
    });
    // Keyed by ISIN: one current price per bond. Superseding a price replaces
    // it rather than appending, because the reader wants "what it costs now",
    // not a personal trade history they never asked to keep.
    //
    // Deliberately NOT part of the dataset-refresh transaction in bondStore —
    // published tables are cleared and replaced on every refresh, and this one
    // is the reader's own work. Losing it to a data update would be a bug.
    this.version(8).stores({
      userPrices: 'isin, observedOn, updatedAt',
    });
    // Monthly CPI, so the yield curve can be shown in real terms offline as
    // well as online. Part of the refresh transaction like every other
    // published table — it is CBK's data, not the reader's, and must be
    // replaced wholesale rather than accumulated.
    this.version(9).stores({
      cpiHistory: 'id, date',
    });
  }
}

export const db = new MwangazaDB();
