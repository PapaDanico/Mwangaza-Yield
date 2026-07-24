import { create } from 'zustand';
import type { Holding } from '@/types/bond';
import { db } from '@/lib/db';

interface PortfolioState {
  holdings: Holding[];
  load: () => Promise<void>;
  addHoldings: (rows: Holding[]) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  holdings: [],
  load: async () => {
    try { set({ holdings: await db.holdings.toArray() }); } catch { /* no IndexedDB */ }
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
