'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';

export default function OfflineBadge() {
  const storeOffline = useBondStore((s) => s.offline);
  const [navOffline, setNavOffline] = useState(false);

  useEffect(() => {
    const update = () => setNavOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!storeOffline && !navOffline) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-gold-600/40 bg-gold-500/10 px-2.5 py-1 text-xs font-medium text-gold-700">
      <WifiOff size={13} /> Offline — cached data
    </span>
  );
}
