'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown, CalendarPlus, MessageCircle } from 'lucide-react';
import { CBK_WHATSAPP_CHANNEL } from '@/lib/share';
import { useBondStore } from '@/stores/bondStore';
import { daysUntil, formatCompactKES, cn, effectiveAuctionStatus } from '@/lib/utils';
import { downloadICS } from '@/lib/ics';
import { BidAssistant } from '@/components/auctions/BidAssistant';
import TrackRecord from '@/components/auctions/TrackRecord';

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-mint-500/15 text-mint-700',
  upcoming: 'bg-gold-500/15 text-gold-700',
  closed: 'bg-sand-200 text-ink-soft',
  settled: 'bg-sand-200 text-ink-faint',
};

const BID_STEPS = [
  'Register on DhowCSD (dhowcsd.centralbank.go.ke) with your ID, KRA PIN and bank details.',
  'Wait for CSD account approval (usually 1–3 business days).',
  'Under "Auctions", select the bond and choose non-competitive bidding (amounts up to Ksh 50M take the weighted average rate — recommended for retail).',
  'Enter your face-value amount (minimum Ksh 50,000; Ksh 100,000 for IFBs).',
  'Submit before the offer close date, then fund your payment obligation by the settlement date via RTGS or bank transfer.',
];

export default function AuctionsPage() {
  const auctions = useBondStore((s) => s.auctions);
  const bonds = useBondStore((s) => s.bonds);
  const auctionResults = useBondStore((s) => s.auctionResults);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const effective = auctions.map((a) => ({ ...a, status: effectiveAuctionStatus(a) }));
  const sorted = effective.sort((a, b) => {
    const rank = (s: string) => ({ open: 0, upcoming: 1, closed: 2, settled: 3 }[s] ?? 4);
    return rank(a.status) - rank(b.status) || a.offerCloseDate.localeCompare(b.offerCloseDate);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Auction Radar</h1>
          <p className="text-sm text-ink-muted">CBK primary issuance calendar with countdowns.</p>
        </div>
        <button
          onClick={() => {
            const live = effective.filter((a) => a.status === 'open' || a.status === 'upcoming');
            if (live.length)
              downloadICS(
                live.map((a) => ({
                  date: a.offerCloseDate,
                  title: `CBK auction closes: ${a.issueCode}`,
                  description: `${a.bondName}. Settlement ${a.settlementDate}. Bid via DhowCSD before close.`,
                })),
                'mwangaza-auctions.ics',
                'Mwangaza Yield — Auctions'
              );
          }}
          className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-sand-50 hover:bg-ink-soft"
        >
          <CalendarPlus size={15} /> Add to calendar
        </button>
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
                    <span className="font-display font-semibold text-ink">{a.issueCode}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase', STATUS_STYLES[a.status])}>
                      {a.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-muted">{a.bondName}</p>
                </div>
                {(a.status === 'open' || a.status === 'upcoming') && (
                  <div className="text-right">
                    <p className="num text-lg font-bold text-gold-700">{Math.max(days, 0)}d</p>
                    <p className="text-[11px] text-ink-faint">to close</p>
                  </div>
                )}
                <ChevronDown size={18} className={cn('text-ink-faint transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="grid gap-2 border-t border-sand-300 p-4 text-sm sm:grid-cols-2">
                  <p><span className="text-ink-muted">Amount offered:</span> <span className="num text-ink">{formatCompactKES(a.amountOfferedKES)}</span></p>
                  <p><span className="text-ink-muted">Coupon:</span> <span className="num text-ink">{a.couponRate != null ? `${a.couponRate}%` : 'Market determined'}</span></p>
                  <p><span className="text-ink-muted">Offer closes:</span> <span className="num text-ink">{a.offerCloseDate}</span></p>
                  <p><span className="text-ink-muted">Settlement:</span> <span className="num text-ink">{a.settlementDate}</span></p>
                  <a
                    href={a.prospectusUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1.5 text-gold-700 hover:underline"
                  >
                    Prospectus <ExternalLink size={13} />
                  </a>
                  {(a.status === 'open' || a.status === 'upcoming') && (
                    <BidAssistant auction={a} bonds={bonds} prints={auctionResults} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TrackRecord />

      <a
        href={CBK_WHATSAPP_CHANNEL}
        target="_blank"
        rel="noopener noreferrer"
        className="card flex items-center gap-3 border-l-4 border-l-mint-600 transition hover:border-mint-600"
      >
        <div className="rounded-xl bg-mint-600 p-2.5 text-white">
          <MessageCircle size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-ink">Follow CBK on WhatsApp</p>
          <p className="text-sm text-ink-muted">
            Auction announcements and results straight from the Central Bank, the moment they publish.
          </p>
        </div>
        <ExternalLink size={16} className="shrink-0 text-ink-faint" />
      </a>

      <div className="card">
        <button onClick={() => setShowGuide(!showGuide)} className="flex min-h-11 w-full items-center justify-between py-1 text-left">
          <span className="font-display font-semibold text-ink">How to bid via DhowCSD</span>
          <ChevronDown size={18} className={cn('text-ink-faint transition-transform', showGuide && 'rotate-180')} />
        </button>
        {showGuide && (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            {BID_STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
