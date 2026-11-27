import { useEffect } from 'react';
import { create } from 'zustand';
import type { Bond, AuctionSchedule, AuctionPrint, MacroIndicator, SecondaryTrade, TBill, ContextIndicator, RateDecision } from '@/types/bond';
import { db, type CpiPoint } from '@/lib/db';
import { whenIdle } from '@/lib/idle';
import { imfContextRows, type WeoSeries } from '@/lib/imf-context';
import { mergeSovereign } from '@/lib/sovereign-merge';

interface BondState {
  bonds: Bond[];
  auctions: AuctionSchedule[];
  macro: MacroIndicator[];
  secondary: SecondaryTrade[];
  tbills: TBill[];
  context: ContextIndicator[];
  cbrHistory: RateDecision[];
  /* The ~400-row auction archive (~280 KB raw, ~28 KB compressed). Loaded
     on demand by useAuctionArchive(), not by fetchData: most pages never read
     it, and on those it was a download, an IndexedDB read and an idle rewrite
     on every visit for nothing (27 Nov 2026). */
  auctionResults: AuctionPrint[];
  archiveLoaded: boolean;
  /* Monthly CPI, for the real-terms view of the curve. Supplementary: its
     absence hides one toggle, never the chart. */
  cpiHistory: CpiPoint[];
  loaded: boolean;
  offline: boolean;
  fetchData: () => Promise<void>;
  loadArchive: () => Promise<void>;
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
  archiveLoaded: false,
  cpiHistory: [],
  loaded: false,
  offline: false,
  fetchData: async () => {
    // Offline-first: serve IndexedDB immediately, then refresh from network.
    try {
      const [bonds, auctions, macro, secondary, tbills, context, cbrHistory, cpiHistory] = await Promise.all([
        db.bonds.toArray(),
        db.auctions.toArray(),
        db.macro.toArray(),
        db.secondary.toArray(),
        db.tbills.toArray(),
        db.context.toArray(),
        db.cbrHistory.toArray(),
        db.cpiHistory.toArray(),
      ]);
      if (bonds.length) set({ bonds, auctions, macro, secondary, tbills, context, cbrHistory, cpiHistory, loaded: true });
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
      const [context, cbrHistory, cpiHistory] = await Promise.all([
        // Two files, merged for display rather than on disk: each scraper's
        // completeness guard counts its own source, and a merged file would
        // make a normal World Bank run look like a collapse. See
        // lib/sovereign-merge.ts. Missing qebr-context.json is the ordinary
        // case until the pipeline has written one, so it falls back to [].
        Promise.all([
          loadJSON<ContextIndicator[]>('/data/context.json').catch(() => []),
          loadJSON<ContextIndicator[]>('/data/qebr-context.json').catch(() => []),
          // A third publisher, for the same reason there is a second: CBK's
          // Weekly Bulletin carries import cover every week against the
          // Treasury's quarter and the World Bank's year. Kept as its own file
          // rather than folded into either, so neither scraper's completeness
          // guard counts rows it did not write — worldbank.py REFUSES to write
          // when it returns fewer indicators than the file already holds, so a
          // row added to context.json would wedge it shut permanently.
          loadJSON<ContextIndicator[]>('/data/cbk-context.json').catch(() => []),
          // The IMF WEO series: held since 29 Aug, read by nothing until
          // 24 Sept. imfContextRows emits only what no other file supplies.
          loadJSON<WeoSeries[]>('/data/imf-outlook.json').catch(() => []),
        ]).then(([wb, qebr, cbk, imf]) =>
          mergeSovereign(
            mergeSovereign(mergeSovereign(wb, qebr), cbk),
            imfContextRows(imf, new Date().getFullYear())
          )
        ),
        loadJSON<RateDecision[]>('/data/cbr-history.json').catch(() => []),
        loadJSON<CpiPoint[]>('/data/cpi-history.json').catch(() => []),
      ]);
      set({ bonds, auctions, macro, secondary, tbills, context, cbrHistory, cpiHistory, loaded: true, offline: false });
      // Replace, don't merge: retired issues must not linger from old datasets.
      // Offline cache only: a later or offline visit reads it, this one never
      // does. Written when idle so it stays out of hydration — see lib/idle.ts.
      whenIdle(() => {
        void db
        .transaction('rw', [db.bonds, db.auctions, db.macro, db.secondary, db.tbills, db.context, db.cbrHistory, db.cpiHistory], async () => {
          await Promise.all([db.bonds.clear(), db.auctions.clear(), db.macro.clear(), db.secondary.clear(), db.tbills.clear(), db.context.clear(), db.cbrHistory.clear(), db.cpiHistory.clear()]);
          await Promise.all([
            db.bonds.bulkPut(bonds),
            db.auctions.bulkPut(auctions),
            db.macro.bulkPut(macro),
            db.secondary.bulkPut(secondary),
            db.tbills.bulkPut(tbills),
            db.context.bulkPut(context),
            db.cbrHistory.bulkPut(cbrHistory),
            db.cpiHistory.bulkPut(cpiHistory),
          ]);
        })
        .catch(() => {});
      });
    } catch {
      set((s) => ({ offline: true, loaded: s.bonds.length > 0 }));
    }
  },
  loadArchive: () => {
    archivePromise ??= (async () => {
      // Offline-first, as fetchData: cached rows now, the network copy after.
      try {
        const cached = await db.auctionResults.toArray();
        if (cached.length) set({ auctionResults: cached, archiveLoaded: true });
      } catch { /* IndexedDB unavailable — fall through */ }
      try {
        const auctionResults = await loadJSON<AuctionPrint[]>('/data/auction-results.json');
        set({ auctionResults, archiveLoaded: true });
        whenIdle(() => {
          void db
            .transaction('rw', db.auctionResults, async () => {
              await db.auctionResults.clear();
              await db.auctionResults.bulkPut(auctionResults);
            })
            .catch(() => {});
        });
      } catch {
        // A missing archive hides the panels that need it; it never breaks a page.
        set({ archiveLoaded: true });
        archivePromise = null; // let a later mount retry, e.g. once back online
      }
    })();
    return archivePromise;
  },
}));

let archivePromise: Promise<void> | null = null;

/**
 * The auction archive, loaded the first time any component asks for it and
 * shared after that. Returns [] until it arrives, which every consumer already
 * handled: the archive has always arrived after first render.
 */
export function useAuctionArchive(): AuctionPrint[] {
  const prints = useBondStore((s) => s.auctionResults);
  const loaded = useBondStore((s) => s.loaded);
  const load = useBondStore((s) => s.loadArchive);
  useEffect(() => {
    void load();
  }, [load]);
  /* Never hand out the archive before the bonds. On a returning visit the
     cached archive can resolve first, and for one frame the curve was drawn
     without maturities: a 331px "not enough data" state, then the 850px
     chart, CLS 0.64 on /yield-curve/ (27 Nov 2026). Before the archive was
     lazy both arrived in one update, so no consumer was written for this. */
  return loaded ? prints : NO_PRINTS;
}

/** One shared empty array, so memos keyed on array identity stay stable. */
const NO_PRINTS: AuctionPrint[] = [];
