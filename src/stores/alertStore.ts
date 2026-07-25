import { create } from 'zustand';
import { db } from '@/lib/db';
import {
  DEFAULT_RULES,
  evaluateAlerts,
  undelivered,
  type AlertEvent,
  type AlertRule,
  type AlertWorld,
} from '@/lib/alerts';
import { notifyEvents } from '@/lib/notify';

interface AlertState {
  rules: AlertRule[];
  events: AlertEvent[];
  /** Events raised on this visit that the reader has not opened yet. */
  unseen: number;
  loaded: boolean;
  load: () => Promise<void>;
  setRule: (id: string, patch: Partial<AlertRule>) => Promise<void>;
  /** Evaluate against the current data, log and notify anything new. */
  refresh: (world: AlertWorld, opts?: { now?: Date; markSeen?: boolean }) => Promise<void>;
  markAllSeen: () => Promise<void>;
}

/** Ids are derived from the rule kind, not random, so a reader who clears
 *  IndexedDB and comes back gets the same rule identities — and therefore does
 *  not get re-notified about coupons they were already told about, if the log
 *  survived. Random ids would silently re-fire everything. */
const ruleId = (kind: string) => `rule-${kind}`;

async function ensureRules(): Promise<AlertRule[]> {
  const existing = await db.alertRules.toArray();
  const have = new Set(existing.map((r) => r.kind));
  const missing = DEFAULT_RULES.filter((d) => !have.has(d.kind)).map((d) => ({
    ...d,
    id: ruleId(d.kind),
    createdAt: new Date().toISOString(),
  }));
  if (missing.length) await db.alertRules.bulkPut(missing);
  return [...existing, ...missing].sort((a, b) => a.kind.localeCompare(b.kind));
}

export const useAlertStore = create<AlertState>((set, get) => ({
  rules: [],
  events: [],
  unseen: 0,
  loaded: false,

  load: async () => {
    try {
      const rules = await ensureRules();
      const unseen = await db.alertLog.filter((d) => !d.seen).count();
      set({ rules, unseen, loaded: true });
    } catch {
      // No IndexedDB (private mode, SSR). Rules still work for this session;
      // nothing is remembered, which is a degraded but honest state.
      set({
        rules: DEFAULT_RULES.map((d) => ({ ...d, id: ruleId(d.kind), createdAt: '' })),
        loaded: true,
      });
    }
  },

  setRule: async (id, patch) => {
    const rules = get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
    set({ rules });
    try {
      const updated = rules.find((r) => r.id === id);
      if (updated) await db.alertRules.put(updated);
    } catch { /* nothing to persist to */ }
  },

  // `markSeen` is what the alerts page passes: the reader is looking straight at
  // the list, so logging an event as unseen — and raising a banner over the page
  // showing it — would be telling someone what they are already reading.
  refresh: async (world, opts = {}) => {
    const { now = new Date(), markSeen = false } = opts;
    const rules = get().rules.length ? get().rules : await ensureRules().catch(() => []);
    const events = evaluateAlerts(rules, world, now);
    set({ rules, events });

    let delivered = new Set<string>();
    try {
      delivered = new Set((await db.alertLog.toArray()).map((d) => d.id));
    } catch { /* no log; treat everything as new for this session only */ }

    const fresh = undelivered(events, delivered);
    if (!fresh.length) {
      if (markSeen) await get().markAllSeen();
      return;
    }

    try {
      await db.alertLog.bulkPut(
        fresh.map((e) => ({ id: e.id, deliveredAt: new Date().toISOString(), seen: markSeen }))
      );
      set({ unseen: await db.alertLog.filter((d) => !d.seen).count() });
    } catch {
      set({ unseen: markSeen ? 0 : fresh.length });
    }
    if (markSeen) {
      await get().markAllSeen();
      return;
    }
    await notifyEvents(fresh);
  },

  markAllSeen: async () => {
    set({ unseen: 0 });
    try {
      const rows = await db.alertLog.filter((d) => !d.seen).toArray();
      if (rows.length) await db.alertLog.bulkPut(rows.map((r) => ({ ...r, seen: true })));
    } catch { /* nothing to mark */ }
  },
}));
