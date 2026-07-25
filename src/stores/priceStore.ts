import { create } from 'zustand';
import { db } from '@/lib/db';
import { isPlausiblePrice, type UserPrice } from '@/lib/prices';

interface PriceState {
  userPrices: UserPrice[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Record or supersede one bond's price. Rejects implausible input. */
  setPrice: (input: { isin: string; price: number; observedOn: string; note?: string }) => Promise<boolean>;
  removePrice: (isin: string) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * The reader's price book. Loaded once at app start and kept in memory so the
 * planners can price a universe synchronously — every consumer of this store
 * reads it inside a `useMemo`, and an async lookup per bond would turn ladder
 * construction into a waterfall.
 */
export const usePriceStore = create<PriceState>((set) => ({
  userPrices: [],
  loaded: false,
  load: async () => {
    try {
      set({ userPrices: await db.userPrices.toArray(), loaded: true });
    } catch {
      // IndexedDB unavailable (SSR, private browsing). An empty price book is
      // correct here: every planner falls back to market, then par.
      set({ loaded: true });
    }
  },
  setPrice: async ({ isin, price, observedOn, note }) => {
    if (!isin || !isPlausiblePrice(price)) return false;
    const row: UserPrice = {
      isin,
      price,
      observedOn,
      note: note?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.userPrices.put(row);
      set({ userPrices: await db.userPrices.toArray() });
      return true;
    } catch {
      return false;
    }
  },
  removePrice: async (isin) => {
    try {
      await db.userPrices.delete(isin);
      set({ userPrices: await db.userPrices.toArray() });
    } catch { /* nothing persisted, nothing to undo */ }
  },
  clear: async () => {
    try { await db.userPrices.clear(); } catch { /* as above */ }
    set({ userPrices: [] });
  },
}));
