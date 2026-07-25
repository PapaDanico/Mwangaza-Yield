'use client';

import { useEffect } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useAlertStore } from '@/stores/alertStore';

export default function AppInit() {
  const fetchData = useBondStore((s) => s.fetchData);
  const loadPortfolio = usePortfolioStore((s) => s.load);
  const loadAlerts = useAlertStore((s) => s.load);
  const refreshAlerts = useAlertStore((s) => s.refresh);

  useEffect(() => {
    // Alerts are evaluated here rather than on the alerts page, because the
    // whole point is to be told without going looking. The badge in the header
    // is only true if this runs on every visit, whichever page you landed on.
    (async () => {
      await Promise.all([fetchData(), loadPortfolio()]);
      await loadAlerts();
      const { bonds, auctions, tbills } = useBondStore.getState();
      const { holdings } = usePortfolioStore.getState();
      await refreshAlerts({ bonds, auctions, tbills, holdings });
    })().catch(() => {});

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [fetchData, loadPortfolio, loadAlerts, refreshAlerts]);

  return null;
}
