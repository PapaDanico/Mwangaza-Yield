'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Target, Calculator, Radar, Briefcase, Layers, Receipt, Bell, Tag, ArrowRightLeft, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAlertStore } from '@/stores/alertStore';
import OfflineBadge from './OfflineBadge';
import DataStatus from './DataStatus';

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
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 lg:gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 lg:gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            {/* nowrap: without it the wordmark broke into two lines whenever
                the nav row got tight, while rendering on one line on phones —
                the brand should not depend on viewport luck. */}
            <span className="whitespace-nowrap font-display text-base font-bold tracking-tight text-ink lg:text-lg">
              {/* gold-700, not gold-600: on the sand header the lighter gold
                  measures 2.87:1, which fails WCAG AA at this size (18px bold
                  needs 4.5:1, and it misses even the 3:1 large-text bar). 700
                  measures 4.53:1 and is already the gold this app uses for
                  every other piece of text, so the wordmark now matches the
                  body rather than introducing a second, unreadable gold. */}
              Mwangaza <span className="text-gold-700">Yield</span>
            </span>
          </Link>
          {/* Tighter spacing until lg: at md this row must fit the wordmark,
              seven labels and four icons into 768px. Without nowrap the row
              "fit" by hyphenating T-Bills into two lines instead of showing
              its width problem honestly. */}
          <nav className="ml-1 hidden gap-0.5 md:flex lg:ml-8 lg:gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  // min-h-11 (44px), not more padding: every sizing comment in
                  // this file is about WIDTH — fitting the wordmark, seven
                  // labels and four icons into 768px at md. Height is the one
                  // dimension that is not contended, so the tap target can
                  // reach 44px without touching the constraint that actually
                  // binds. These links were ~28px tall.
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-1.5 text-xs font-medium transition-colors lg:px-3 lg:text-sm',
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
            {/* DataStatus is hidden at md (768px) so the header row fits within the
                viewport. The Navbar comment states the budget is the wordmark + seven
                nav labels + four icon buttons at 768px; DataStatus is a fifth icon that
                pushes the total ~29px past the right edge. It becomes visible at lg
                (1024px) where there is room to spare. */}
            <div className="hidden lg:block">
              <DataStatus />
            </div>
            {/* Command palette trigger — gives power users a visual entry point
                alongside the Cmd+K shortcut. */}
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('mwangaza:palette'))}
              aria-label="Open command palette (⌘K)"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-ink-muted transition-colors hover:bg-sand-200 hover:text-ink lg:px-3"
            >
              <Search size={18} />
              <kbd className="hidden rounded border border-sand-300 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint lg:block">
                ⌘K
              </kbd>
            </button>
            {/* Selling is decided once and cannot be undone, so it earns a
                place on every page — but not 40px of a 360px tab row. Same
                reasoning as the price book and Alerts that follow. */}
            <Link
              href="/sell/"
              aria-label="Should you sell?"
              className={cn(
                'inline-flex min-h-11 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-sand-200 lg:p-2',
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
                'inline-flex min-h-11 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-sand-200 lg:p-2',
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
                'relative inline-flex min-h-11 items-center justify-center rounded-lg p-2 transition-colors hover:bg-sand-200',
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
