'use client';

import { useEffect, useState } from 'react';
import meta from '../../../public/data/meta.json';

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

  const dataAgeDays = Math.floor((Date.now() - new Date(meta.generatedAt).getTime()) / 86_400_000);
  return (
    <div className="border-b border-gold-600/35 bg-gold-500/10 px-3 py-1.5 text-xs text-gold-800">
      {dataAgeDays > 7
        ? `Data is ${dataAgeDays} days old. Connect to internet for latest figures.`
        : `Working offline with data from ${meta.generatedAt.slice(0, 10)}.`}
    </div>
  );
}
