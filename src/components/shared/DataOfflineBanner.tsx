'use client';

import { useEffect, useState } from 'react';
import { latestFigureDate } from '@/lib/data-freshness';

export default function DataOfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  // Dated by the newest figure held, not the pipeline run: while figures are
  // entered by hand the scrape stamp is weeks older than the data on screen.
  const latest = latestFigureDate();
  const dataAgeDays = latest ? Math.floor((Date.now() - new Date(latest).getTime()) / 86_400_000) : null;
  return (
    <div className="border-b border-gold-600/35 bg-gold-500/10 px-3 py-1.5 text-xs text-gold-800">
      {dataAgeDays !== null && dataAgeDays > 7
        ? `Newest figure saved here is ${dataAgeDays} days old. Connect to the internet for the latest.`
        : `Working offline with figures up to ${latest ?? 'the last visit'}.`}
    </div>
  );
}
