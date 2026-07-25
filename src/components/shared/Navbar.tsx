'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Target, Calculator, Radar, Briefcase, Layers, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import OfflineBadge from './OfflineBadge';

const links = [
  { href: '/dashboard/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/goals/', label: 'Goals', Icon: Target },
  { href: '/tbills/', label: 'T-Bills', Icon: Receipt },
  { href: '/ladder/', label: 'Ladder', Icon: Layers },
  { href: '/calculator/', label: 'Calculator', Icon: Calculator },
  { href: '/auctions/', label: 'Auctions', Icon: Radar },
  { href: '/portfolio/', label: 'Portfolio', Icon: Briefcase },
];

export default function Navbar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href.replace(/\/$/, ''));

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-sand-300 bg-sand-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              Mwangaza <span className="text-gold-600">Yield</span>
            </span>
          </Link>
          <nav className="ml-8 hidden gap-1 md:flex">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-ink text-sand-50'
                    : 'text-ink-muted hover:bg-sand-200 hover:text-ink'
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <OfflineBadge />
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-sand-300 bg-sand-50/95 py-2 backdrop-blur md:hidden">
        {links.filter((l) => l.href !== '/calculator/').map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              // Seven tabs at px-3 need 469px; a 360px Android screen is common and
              // the row pushed the whole page into a sideways scroll. Sharing the
              // width evenly keeps every label readable without truncation.
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[11px] font-medium',
              isActive(href) ? 'text-gold-700' : 'text-ink-muted'
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
