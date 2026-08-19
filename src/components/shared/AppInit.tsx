'use client';

import { useEffect } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useAlertStore } from '@/stores/alertStore';
import { usePriceStore } from '@/stores/priceStore';
import { useCommunityPriceStore } from '@/stores/communityPriceStore';

export default function AppInit() {
  const fetchData = useBondStore((s) => s.fetchData);
  const loadPortfolio = usePortfolioStore((s) => s.load);
  const loadPrices = usePriceStore((s) => s.load);
  const loadAlerts = useAlertStore((s) => s.load);
  const refreshAlerts = useAlertStore((s) => s.refresh);
  const loadCommunityPrices = useCommunityPriceStore((s) => s.load);

  useEffect(() => {
    // Alerts are evaluated here rather than on the alerts page, because the
    // whole point is to be told without going looking. The badge in the header
    // is only true if this runs on every visit, whichever page you landed on.
    (async () => {
      // Prices load alongside holdings, not after the network: every planner
      // reads them synchronously, and arriving late would render one set of
      // yields at par and then silently restate them.
      await Promise.all([fetchData(), loadPortfolio(), loadPrices(), loadCommunityPrices()]);
      await loadAlerts();
      const { bonds, auctions, tbills } = useBondStore.getState();
      const { holdings } = usePortfolioStore.getState();
      await refreshAlerts({ bonds, auctions, tbills, holdings });
    })().catch(() => {});

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [fetchData, loadPortfolio, loadPrices, loadAlerts, refreshAlerts, loadCommunityPrices]);

  return null;
}
