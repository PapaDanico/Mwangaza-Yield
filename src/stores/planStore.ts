import { create } from 'zustand';
import { db } from '@/lib/db';
import type { SavedPlan } from '@/lib/plans';

interface PlanState {
  plans: SavedPlan[];
  load: () => Promise<void>;
  save: (plan: SavedPlan) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePlanStore = create<PlanState>((set) => ({
  plans: [],
  load: async () => {
    try {
      set({ plans: await db.plans.orderBy('updatedAt').reverse().toArray() });
    } catch { /* IndexedDB unavailable */ }
  },
  save: async (plan) => {
    await db.plans.put(plan);
    set({ plans: await db.plans.orderBy('updatedAt').reverse().toArray() });
  },
  remove: async (id) => {
    await db.plans.delete(id);
    set({ plans: await db.plans.orderBy('updatedAt').reverse().toArray() });
  },
}));
