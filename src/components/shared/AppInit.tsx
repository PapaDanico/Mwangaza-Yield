'use client';

import { useEffect } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';

export default function AppInit() {
  const fetchData = useBondStore((s) => s.fetchData);
  const loadPortfolio = usePortfolioStore((s) => s.load);

  useEffect(() => {
    fetchData();
    loadPortfolio();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [fetchData, loadPortfolio]);

  return null;
}
