import { create } from 'zustand';
import type { Holding } from '@/types/bond';
import { db } from '@/lib/db';

interface PortfolioState {
  holdings: Holding[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Record or supersede one bond's price. Rejects implausible input. */
  addHoldings: (rows: Holding[]) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  holdings: [],
  loaded: false,
  load: async () => {
    try { set({ holdings: await db.holdings.toArray(), loaded: true }); } catch { set({ loaded: true }); /* no IndexedDB */ }
  },
  addHoldings: async (rows) => {
    await db.holdings.bulkPut(rows);
    set({ holdings: await db.holdings.toArray() });
  },
  removeHolding: async (id) => {
    await db.holdings.delete(id);
    set({ holdings: await db.holdings.toArray() });
  },
  clear: async () => {
    await db.holdings.clear();
    set({ holdings: [] });
  },
}));
