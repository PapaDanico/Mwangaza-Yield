'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { daysUntil, formatCompactKES, cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-emerald-500/15 text-emerald-400',
  upcoming: 'bg-gold-500/15 text-gold-400',
  closed: 'bg-slate-700 text-slate-300',
  settled: 'bg-slate-700/60 text-slate-400',
};

const BID_STEPS = [
  'Register on DhowCSD (dhowcsd.centralbank.go.ke) with your ID, KRA PIN and bank details.',
  'Wait for CSD account approval (usually 1–3 business days).',
  'Under "Auctions", select the bond and choose non-competitive bidding (amounts up to KES 50M take the weighted average rate — recommended for retail).',
  'Enter your face-value amount (minimum KES 50,000; KES 100,000 for IFBs).',
  'Submit before the offer close date, then fund your payment obligation by the settlement date via RTGS or bank transfer.',
];

export default function AuctionsPage() {
  const auctions = useBondStore((s) => s.auctions);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const sorted = [...auctions].sort((a, b) => {
    const rank = (s: string) => ({ open: 0, upcoming: 1, closed: 2, settled: 3 }[s] ?? 4);
    return rank(a.status) - rank(b.status) || a.offerCloseDate.localeCompare(b.offerCloseDate);
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Auction Radar</h1>
        <p className="text-sm text-slate-400">CBK primary issuance calendar with countdowns.</p>
      </div>

      <div className="space-y-3">
        {sorted.map((a) => {
          const days = daysUntil(a.offerCloseDate);
          const isOpen = expanded === a.id;
          return (
            <div key={a.id} className="card p-0">
              <button
                onClick={() => setExpanded(isOpen ? null : a.id)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{a.issueCode}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase', STATUS_STYLES[a.status])}>
                      {a.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-400">{a.bondName}</p>
                </div>
                {(a.status === 'open' || a.status === 'upcoming') && (
                  <div className="text-right">
                    <p className="num text-lg font-bold text-gold-400">{Math.max(days, 0)}d</p>
                    <p className="text-[11px] text-slate-500">to close</p>
                  </div>
                )}
                <ChevronDown size={18} className={cn('text-slate-500 transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="grid gap-2 border-t border-slate-700/50 p-4 text-sm sm:grid-cols-2">
                  <p><span className="text-slate-400">Amount offered:</span> <span className="num text-white">{formatCompactKES(a.amountOfferedKES)}</span></p>
                  <p><span className="text-slate-400">Coupon:</span> <span className="num text-white">{a.couponRate != null ? `${a.couponRate}%` : 'Market determined'}</span></p>
                  <p><span className="text-slate-400">Offer closes:</span> <span className="num text-white">{a.offerCloseDate}</span></p>
                  <p><span className="text-slate-400">Settlement:</span> <span className="num text-white">{a.settlementDate}</span></p>
                  <a
                    href={a.prospectusUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1.5 text-gold-400 hover:underline"
                  >
                    Prospectus <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <button onClick={() => setShowGuide(!showGuide)} className="flex w-full items-center justify-between text-left">
          <span className="font-semibold text-white">How to bid via DhowCSD</span>
          <ChevronDown size={18} className={cn('text-slate-500 transition-transform', showGuide && 'rotate-180')} />
        </button>
        {showGuide && (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            {BID_STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
