import { create } from 'zustand';
import type { Bond, AuctionSchedule, AuctionPrint, MacroIndicator, SecondaryTrade, TBill, ContextIndicator, RateDecision } from '@/types/bond';
import { db, type CpiPoint } from '@/lib/db';
import { mergeSovereign } from '@/lib/sovereign-merge';

interface BondState {
  bonds: Bond[];
  auctions: AuctionSchedule[];
  macro: MacroIndicator[];
  secondary: SecondaryTrade[];
  tbills: TBill[];
  context: ContextIndicator[];
  cbrHistory: RateDecision[];
  auctionResults: AuctionPrint[];
  /* Monthly CPI, for the real-terms view of the curve. Supplementary: its
     absence hides one toggle, never the chart. */
  cpiHistory: CpiPoint[];
  loaded: boolean;
  offline: boolean;
  fetchData: () => Promise<void>;
}

async function loadJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export const useBondStore = create<BondState>((set) => ({
  bonds: [],
  auctions: [],
  macro: [],
  secondary: [],
  tbills: [],
  context: [],
  cbrHistory: [],
  auctionResults: [],
  cpiHistory: [],
  loaded: false,
  offline: false,
  fetchData: async () => {
    // Offline-first: serve IndexedDB immediately, then refresh from network.
    try {
      const [bonds, auctions, macro, secondary, tbills, context, cbrHistory, auctionResults, cpiHistory] = await Promise.all([
        db.bonds.toArray(),
        db.auctions.toArray(),
        db.macro.toArray(),
        db.secondary.toArray(),
        db.tbills.toArray(),
        db.context.toArray(),
        db.cbrHistory.toArray(),
        db.auctionResults.toArray(),
        db.cpiHistory.toArray(),
      ]);
      if (bonds.length) set({ bonds, auctions, macro, secondary, tbills, context, cbrHistory, auctionResults, cpiHistory, loaded: true });
    } catch { /* IndexedDB unavailable (SSR/private mode) — fall through */ }

    try {
      const [bonds, auctions, macro, secondary, tbills] = await Promise.all([
        loadJSON<Bond[]>('/data/bonds.json'),
        loadJSON<AuctionSchedule[]>('/data/auctions.json'),
        loadJSON<MacroIndicator[]>('/data/macro.json'),
        loadJSON<SecondaryTrade[]>('/data/secondary.json'),
        loadJSON<TBill[]>('/data/tbills.json'),
      ]);
      // Sovereign context and rate history are supplementary — never let them
      // break market data. A missing history hides one panel; a rejected
      // Promise.all would blank the whole dashboard.
      const [context, cbrHistory, auctionResults, cpiHistory] = await Promise.all([
        // Two files, merged for display rather than on disk: each scraper's
        // completeness guard counts its own source, and a merged file would
        // make a normal World Bank run look like a collapse. See
        // lib/sovereign-merge.ts. Missing qebr-context.json is the ordinary
        // case until the pipeline has written one, so it falls back to [].
        Promise.all([
          loadJSON<ContextIndicator[]>('/data/context.json').catch(() => []),
          loadJSON<ContextIndicator[]>('/data/qebr-context.json').catch(() => []),
        ]).then(([wb, qebr]) => mergeSovereign(wb, qebr)),
        loadJSON<RateDecision[]>('/data/cbr-history.json').catch(() => []),
        loadJSON<AuctionPrint[]>('/data/auction-results.json').catch(() => []),
        loadJSON<CpiPoint[]>('/data/cpi-history.json').catch(() => []),
      ]);
      set({ bonds, auctions, macro, secondary, tbills, context, cbrHistory, auctionResults, cpiHistory, loaded: true, offline: false });
      // Replace, don't merge: retired issues must not linger from old datasets.
      await db
        .transaction('rw', [db.bonds, db.auctions, db.macro, db.secondary, db.tbills, db.context, db.cbrHistory, db.auctionResults, db.cpiHistory], async () => {
          await Promise.all([db.bonds.clear(), db.auctions.clear(), db.macro.clear(), db.secondary.clear(), db.tbills.clear(), db.context.clear(), db.cbrHistory.clear(), db.auctionResults.clear(), db.cpiHistory.clear()]);
          await Promise.all([
            db.bonds.bulkPut(bonds),
            db.auctions.bulkPut(auctions),
            db.macro.bulkPut(macro),
            db.secondary.bulkPut(secondary),
            db.tbills.bulkPut(tbills),
            db.context.bulkPut(context),
            db.cbrHistory.bulkPut(cbrHistory),
            db.cpiHistory.bulkPut(cpiHistory),
            db.auctionResults.bulkPut(auctionResults),
          ]);
        })
        .catch(() => {});
    } catch {
      set((s) => ({ offline: true, loaded: s.bonds.length > 0 }));
    }
  },
}));
