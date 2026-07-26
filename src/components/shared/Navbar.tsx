'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Target, Calculator, Radar, Briefcase, Layers, Receipt, Bell, Tag, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlertStore } from '@/stores/alertStore';
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
  const unseen = useAlertStore((s) => s.unseen);
  const isActive = (href: string) => pathname.startsWith(href.replace(/\/$/, ''));

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-sand-300 bg-sand-100/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-display text-lg font-bold tracking-tight text-ink">
              {/* gold-700, not gold-600: on the sand header the lighter gold
                  measures 2.87:1, which fails WCAG AA at this size (18px bold
                  needs 4.5:1, and it misses even the 3:1 large-text bar). 700
                  measures 4.53:1 and is already the gold this app uses for
                  every other piece of text, so the wordmark now matches the
                  body rather than introducing a second, unreadable gold. */}
              Mwangaza <span className="text-gold-700">Yield</span>
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
          <div className="ml-auto flex items-center gap-1">
            <OfflineBadge />
            {/* Selling is decided once and cannot be undone, so it earns a
                place on every page — but not 40px of a 360px tab row. Same
                reasoning as the price book and Alerts that follow. */}
            <Link
              href="/sell/"
              aria-label="Should you sell?"
              className={cn(
                'rounded-lg p-2 transition-colors hover:bg-sand-200',
                isActive('/sell/') ? 'text-gold-700' : 'text-ink-muted hover:text-ink'
              )}
            >
              <ArrowRightLeft size={20} />
            </Link>
            {/* The price book changes every yield in the app. */}
            <Link
              href="/prices/"
              aria-label="Your price book"
              className={cn(
                'rounded-lg p-2 transition-colors hover:bg-sand-200',
                isActive('/prices/') ? 'text-gold-700' : 'text-ink-muted hover:text-ink'
              )}
            >
              <Tag size={20} />
            </Link>
            {/* The eighth nav item would have broken the mobile tab row, which
                already shares 360px between seven. A header icon costs no width
                on either layout and is reachable from every page. */}
            <Link
              href="/alerts/"
              aria-label={unseen ? `Alerts — ${unseen} new` : 'Alerts'}
              className={cn(
                'relative rounded-lg p-2 transition-colors hover:bg-sand-200',
                isActive('/alerts/') ? 'text-gold-700' : 'text-ink-muted hover:text-ink'
              )}
            >
              <Bell size={20} />
              {unseen > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold-600 ring-2 ring-sand-100" />
              )}
            </Link>
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
