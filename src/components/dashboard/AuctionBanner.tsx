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
      className="card flex items-center gap-4 border-gold-600/40 bg-gradient-to-r from-treasury-navy to-card-dark transition hover:border-gold-500/70"
    >
      <div className="rounded-xl bg-gold-500/15 p-3 text-gold-400">
        <Radar size={26} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-400">
          {next.status === 'open' ? 'Auction open now' : 'Next auction'}
        </p>
        <p className="truncate font-semibold text-white">
          {next.issueCode} · {next.bondName}
        </p>
        <p className="text-sm text-slate-400">
          {next.amountOfferedKES > 0 ? `${formatCompactKES(next.amountOfferedKES)} on offer · ` : ''}
          closes {next.offerCloseDate}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-2xl font-bold text-gold-400">{Math.max(days, 0)}</p>
        <p className="text-xs text-slate-400">days left</p>
      </div>
      <ArrowRight size={18} className="text-slate-500" />
    </Link>
  );
}
