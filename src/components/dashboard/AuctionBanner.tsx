'use client';

import Link from 'next/link';
import { Radar, ArrowRight } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { daysUntil, formatCompactKES } from '@/lib/utils';

export default function AuctionBanner() {
  const auctions = useBondStore((s) => s.auctions);
  const next = auctions
    .filter((a) => a.status === 'open' || a.status === 'upcoming')
    .sort((a, b) => a.offerCloseDate.localeCompare(b.offerCloseDate))[0];

  if (!next) return null;
  const days = daysUntil(next.offerCloseDate);

  return (
    <Link
      href="/auctions/"
      className="card flex items-center gap-4 border-l-4 border-l-gold-500 transition hover:border-gold-500"
    >
      <div className="rounded-xl bg-ink p-3 text-gold-500">
        <Radar size={26} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
          {next.status === 'open' ? 'Auction open now' : 'Next auction'}
        </p>
        <p className="truncate font-display font-semibold text-ink">
          {next.issueCode} · {next.bondName}
        </p>
        <p className="text-sm text-ink-muted">
          {next.amountOfferedKES > 0 ? `${formatCompactKES(next.amountOfferedKES)} on offer · ` : ''}
          closes {next.offerCloseDate}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-2xl font-bold text-gold-700">{Math.max(days, 0)}</p>
        <p className="text-xs text-ink-faint">days left</p>
      </div>
      <ArrowRight size={18} className="text-ink-faint" />
    </Link>
  );
}
