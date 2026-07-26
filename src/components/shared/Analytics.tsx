'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackRoute } from '@/lib/analytics';

/**
 * Counts tool-page visits. Renders nothing; see src/lib/analytics.ts for what
 * is measured and — more importantly — what is deliberately not.
 */
export default function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) trackRoute(pathname);
  }, [pathname]);
  return null;
}
