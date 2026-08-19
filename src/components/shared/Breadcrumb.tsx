'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { ROUTE_LABELS } from '@/lib/routes';

interface Crumb {
  label: string;
  href: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];
  const label = ROUTE_LABELS[pathname];
  if (label) crumbs.push({ label, href: pathname });
  return crumbs;
}

/**
 * Breadcrumb navigation.
 *
 * On mobile: shows only the current page label (the Back button in the
 * browser serves as the back affordance). On ≥md: shows the full Home >
 * Section trail.
 */
export default function Breadcrumb() {
  const pathname = usePathname();

  // Only render on pages that are one level deep (direct children of /).
  // Deeper nesting would require a more sophisticated route map.
  const crumbs = buildCrumbs(pathname ?? '/');

  // Don't show a breadcrumb on the home page itself — it would just say "Home".
  if (crumbs.length <= 1) return null;

  const current = crumbs[crumbs.length - 1]!;

  return (
    <nav aria-label="Breadcrumb" className="no-print">
      {/* Mobile: current page name only */}
      <p className="px-4 py-1.5 text-[12px] font-medium text-ink-muted md:hidden">
        {current.label}
      </p>

      {/* Desktop: full trail */}
      <ol
        className="hidden items-center gap-1 px-4 py-1.5 text-[12px] text-ink-muted md:flex"
        aria-label="Breadcrumb"
      >
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {i === 0 ? (
                <Link
                  href={crumb.href}
                  className="flex items-center gap-0.5 hover:text-ink"
                  aria-label="Home"
                >
                  <Home size={12} />
                </Link>
              ) : isLast ? (
                <span className="font-medium text-ink" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="hover:text-ink">
                  {crumb.label}
                </Link>
              )}
              {!isLast && <ChevronRight size={12} className="shrink-0 text-ink-faint" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
