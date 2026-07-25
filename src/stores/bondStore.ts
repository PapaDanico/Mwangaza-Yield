import { create } from 'zustand';
import type { Bond, AuctionSchedule, MacroIndicator, SecondaryTrade, TBill } from '@/types/bond';
import { db } from '@/lib/db';

interface BondState {
  bonds: Bond[];
  auctions: AuctionSchedule[];
  macro: MacroIndicator[];
  secondary: SecondaryTrade[];
  tbills: TBill[];
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
  loaded: false,
  offline: false,
  fetchData: async () => {
    // Offline-first: serve IndexedDB immediately, then refresh from network.
    try {
      const [bonds, auctions, macro, secondary, tbills] = await Promise.all([
        db.bonds.toArray(),
        db.auctions.toArray(),
        db.macro.toArray(),
        db.secondary.toArray(),
        db.tbills.toArray(),
      ]);
      if (bonds.length) set({ bonds, auctions, macro, secondary, tbills, loaded: true });
    } catch { /* IndexedDB unavailable (SSR/private mode) — fall through */ }

    try {
      const [bonds, auctions, macro, secondary, tbills] = await Promise.all([
        loadJSON<Bond[]>('/data/bonds.json'),
        loadJSON<AuctionSchedule[]>('/data/auctions.json'),
        loadJSON<MacroIndicator[]>('/data/macro.json'),
        loadJSON<SecondaryTrade[]>('/data/secondary.json'),
        loadJSON<TBill[]>('/data/tbills.json'),
      ]);
      set({ bonds, auctions, macro, secondary, tbills, loaded: true, offline: false });
      // Replace, don't merge: retired issues must not linger from old datasets.
      await db
        .transaction('rw', [db.bonds, db.auctions, db.macro, db.secondary, db.tbills], async () => {
          await Promise.all([db.bonds.clear(), db.auctions.clear(), db.macro.clear(), db.secondary.clear(), db.tbills.clear()]);
          await Promise.all([
            db.bonds.bulkPut(bonds),
            db.auctions.bulkPut(auctions),
            db.macro.bulkPut(macro),
            db.secondary.bulkPut(secondary),
            db.tbills.bulkPut(tbills),
          ]);
        })
        .catch(() => {});
    } catch {
      set((s) => ({ offline: true, loaded: s.bonds.length > 0 }));
    }
  },
}));
