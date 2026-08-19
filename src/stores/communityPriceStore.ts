import { create } from 'zustand';
import { db } from '@/lib/db';
import {
  anonymizeSubmission,
  aggregatePrices,
  type PriceSubmission,
  type AnonymizedSubmission,
  type CommunityPrice,
} from '@/lib/communityPrice';

interface CommunityPriceState {
  /** Raw anonymized submissions in memory, keyed by ISIN. */
  byIsin: Record<string, AnonymizedSubmission[]>;
  loaded: boolean;
  load: () => Promise<void>;
  /**
   * Add an anonymized version of a submission to the community store.
   * No-ops silently if IndexedDB is unavailable.
   */
  contribute: (submission: PriceSubmission) => Promise<void>;
  /** Clear all community data — never touches userPrices. */
  clear: () => Promise<void>;
}

/**
 * Return the community aggregate for one ISIN, or null if the privacy
 * threshold has not been reached.
 */
export function selectCommunityPrice(
  state: CommunityPriceState,
  isin: string,
): CommunityPrice | null {
  const subs = state.byIsin[isin] ?? [];
  return aggregatePrices(subs);
}

export const useCommunityPriceStore = create<CommunityPriceState>((set, get) => ({
  byIsin: {},
  loaded: false,

  load: async () => {
    try {
      const all = await db.communityPrices.toArray();
      const byIsin: Record<string, AnonymizedSubmission[]> = {};
      for (const row of all) {
        const { isin } = row;
        (byIsin[isin] ??= []).push(row);
      }
      set({ byIsin, loaded: true });
    } catch {
      // IndexedDB unavailable (SSR, private browsing). Community features
      // degrade gracefully — stats are simply absent.
      set({ loaded: true });
    }
  },

  contribute: async (submission) => {
    try {
      const existing = get().byIsin[submission.isin]?.length ?? 0;
      const anon = anonymizeSubmission(submission, existing);
      await db.communityPrices.add(anon);
      // Reload from DB so the in-memory map is a faithful reflection of storage.
      const all = await db.communityPrices.toArray();
      const byIsin: Record<string, AnonymizedSubmission[]> = {};
      for (const row of all) {
        (byIsin[row.isin] ??= []).push(row);
      }
      set({ byIsin });
    } catch {
      // Silently no-op — community contribution is opt-in; storage failure
      // must not block the user's own price save.
    }
  },

  clear: async () => {
    try { await db.communityPrices.clear(); } catch { /* nothing to undo */ }
    set({ byIsin: {} });
  },
}));
