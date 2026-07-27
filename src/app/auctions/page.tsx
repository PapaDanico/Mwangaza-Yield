'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown, CalendarPlus, MessageCircle } from 'lucide-react';
import { CBK_WHATSAPP_CHANNEL } from '@/lib/share';
import { useBondStore } from '@/stores/bondStore';
import { daysUntil, formatCompactKES, cn, effectiveAuctionStatus } from '@/lib/utils';
import { downloadICS } from '@/lib/ics';
import { BidAssistant } from '@/components/auctions/BidAssistant';
import TrackRecord from '@/components/auctions/TrackRecord';
import DemandRecord from '@/components/auctions/DemandRecord';

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

  /**
   * One row per AUCTION, not per bond.
   *
   * The calendar became per-bond when it started being read from prospectuses,
   * which is right for the data — a coupon belongs to a bond, not to a sale.
   * It is wrong for this page. CBK sells three bonds in one auction, on one
   * date, against one bid deadline, and a bidder experiences that as a single
   * decision. Rendering it as three cards cost 390 pixels to say one thing
   * three times, and broke the mental model while doing it.
   */
  const grouped = Array.from(
    effective.reduce((acc, a) => {
      const key = `${a.auctionDate}|${a.offerCloseDate}`;
      (acc.get(key) ?? acc.set(key, []).get(key)!).push(a);
      return acc;
    }, new Map<string, typeof effective>())
  ).map(([key, legs]) => ({ key, legs, lead: legs[0] }));

  const sorted = grouped.sort((a, b) => {
    const rank = (s: string) => ({ open: 0, upcoming: 1, closed: 2, settled: 3 }[s] ?? 4);
    return (
      rank(a.lead.status) - rank(b.lead.status) ||
      b.lead.offerCloseDate.localeCompare(a.lead.offerCloseDate)
    );
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
            // One reminder per AUCTION. Keyed off the per-bond records this
            // would put three identical alarms in the reader's calendar for a
            // single bid deadline — the same mistake the cards were making,
            // exported into software they actually live in.
            const live = sorted.filter(
              (g) => g.lead.status === 'open' || g.lead.status === 'upcoming'
            );
            if (live.length)
              downloadICS(
                live.map(({ legs, lead }) => ({
                  date: lead.offerCloseDate,
                  title: `CBK auction closes: ${legs.map((l) => l.issueCode).join(' + ')}`,
                  description: `${legs.length} bond${legs.length === 1 ? '' : 's'}. Settlement ${lead.settlementDate}. Bid via DhowCSD before close.`,
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
        {sorted.map(({ key, legs, lead }) => {
          const days = daysUntil(lead.offerCloseDate);
          const isOpen = expanded === key;
          const live = lead.status === 'open' || lead.status === 'upcoming';
          const multi = legs.length > 1;
          return (
            <div key={key} className="card p-0">
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="num text-sm font-semibold text-ink-soft">
                      {lead.auctionDate}
                    </span>
                    <span className="font-display font-semibold text-ink">
                      {legs.map((l) => l.issueCode).join(' · ')}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase', STATUS_STYLES[lead.status])}>
                      {lead.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">
                    {/* The codes are already in the header, so a multi-bond
                        sale names its count rather than one leg's description
                        followed by "and others" — which reads as though the
                        first bond were the important one. */}
                    {multi ? `${legs.length} bonds` : lead.bondName} · settles{' '}
                    {lead.settlementDate}
                  </p>
                </div>
                {live && (
                  <div className="shrink-0 text-right">
                    <p className="num text-lg font-bold text-gold-700">{Math.max(days, 0)}d</p>
                    <p className="text-[11px] text-ink-faint">to close</p>
                  </div>
                )}
                <ChevronDown size={18} className={cn('shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-sand-300 p-4">
                  {/* Per bond, because coupon and tenor are per bond — the
                      thing the grouped header deliberately does not claim. */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
                          <th className="pb-1 font-medium">Bond</th>
                          <th className="pb-1 text-right font-medium">Coupon</th>
                          <th className="pb-1 text-right font-medium">Offered</th>
                          <th className="pb-1 text-right font-medium">Prospectus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {legs.map((l) => (
                          <tr key={l.id} className="border-t border-sand-200">
                            <td className="py-1.5 text-ink">
                              {l.issueCode}
                              <span className="block text-[11px] text-ink-faint">{l.bondName}</span>
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-ink-soft">
                              {l.couponRate != null ? `${l.couponRate}%` : 'Market'}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-ink-soft">
                              {formatCompactKES(l.amountOfferedKES)}
                            </td>
                            <td className="py-1.5 text-right">
                              <a
                                href={l.prospectusUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-gold-700 hover:underline"
                              >
                                Open <ExternalLink size={12} />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Offer closes <span className="num text-ink">{lead.offerCloseDate}</span> ·
                    settles <span className="num text-ink">{lead.settlementDate}</span>
                  </p>
                  {live && (
                    <BidAssistant auction={lead} bonds={bonds} prints={auctionResults} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DemandRecord />

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
