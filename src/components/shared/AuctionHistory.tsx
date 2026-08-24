'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';

/* Deferred: see AuctionHistoryPlot. The placeholder holds the chart's height
   so the text below it does not jump when the plot arrives. */
const AuctionHistoryPlot = dynamic(() => import('./AuctionHistoryPlot'), {
  ssr: false,
  loading: () => <div className="h-44" aria-hidden="true" />,
});
import { historyFor, summarise, describeHistory, readAgainstOwnRange, monthYear } from '@/lib/auction-history';
import { cn } from '@/lib/utils';
import Term from '@/components/shared/Term';

/**
 * "Is that a good yield?" — answered with the only benchmark that needs no
 * explaining: what the same bond paid the last few times it was sold.
 *
 * Renders nothing below two auctions. A single point is not a history, and an
 * empty card that says "no data" on most bonds would train people to ignore
 * the card on the bonds where it does have something to say.
 */
export default function AuctionHistory({ issueCode }: { issueCode: string }) {
  const prints = useBondStore((s) => s.auctionResults);

  const history = useMemo(
    () => summarise(historyFor(prints, issueCode)),
    [prints, issueCode],
  );

  if (!history) return null;

  const bps = history.changeBps ?? 0;
  const Icon = bps === 0 ? Minus : bps > 0 ? ArrowUpRight : ArrowDownRight;
  const series = history.points.map((p) => ({ ...p, label: p.date.slice(0, 7) }));

  return (
    <div className="card">
      <div className="mb-3">
        <h2 className="font-semibold text-ink">What this bond has paid before</h2>
        <p className="text-xs text-ink-faint">
          Every time CBK has sold {issueCode} at{' '}
          <Term slug="auction">auction</Term>, and the yearly return buyers walked away with
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Most recent auction
          </p>
          <p className="num mt-0.5 text-3xl font-bold leading-none text-ink">
            {history.latest.rate.toFixed(2)}
            <span className="ml-1 text-lg font-normal text-ink-muted">%</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">{monthYear(history.latest.date)}</p>
        </div>
        {history.previous && (
          <div className="text-xs text-ink-muted">
            <p className="flex items-center gap-1">
              <Icon
                size={14}
                className={cn('shrink-0', bps > 0 ? 'text-mint-700' : bps < 0 ? 'text-gold-700' : 'text-ink-muted')}
              />
              <span className="num font-bold text-ink-soft">
                {bps === 0 ? 'no change' : `${bps > 0 ? '+' : '−'}${(Math.abs(bps) / 100).toFixed(2)} pp`}
              </span>
            </p>
            <p className="mt-0.5">
              vs {history.previous.rate.toFixed(2)}% in {monthYear(history.previous.date)}
            </p>
          </div>
        )}
      </div>

      <div className="h-44">
        <AuctionHistoryPlot series={series} latestRate={history.latest.rate} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{describeHistory(history)}</p>
      <div className="mt-3 rounded-xl border border-sand-300 bg-sand-100 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          How that compares
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{readAgainstOwnRange(history)}</p>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Every auction we have read
        </p>
        <ul className="space-y-0.5">
          {[...history.points].reverse().map((p) => {
            const content = <>
              <span className="num shrink-0 tabular-nums text-ink-muted">{p.date}</span>
              <span className="num min-w-0 flex-1 font-semibold text-ink-soft">
                {p.rate.toFixed(2)}%
              </span>
              {p.pricePer100 != null && (
                <span className="num shrink-0 text-ink-faint">
                  at {p.pricePer100.toFixed(2)} per 100
                </span>
              )}
              {p.transactionType !== 'issuance' && (
                <span className="shrink-0 rounded bg-sand-200 px-1 py-0.5 text-[10px] font-medium uppercase text-ink-faint">
                  {p.transactionType}
                </span>
              )}
              {p.sourceUrl && <ExternalLink size={11} className="shrink-0 text-ink-faint" />}
            </>;
            return (
              <li key={p.date} title={p.sourceNote}>
                {p.sourceUrl ? (
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-sand-100"
                  >
                    {content}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs">
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Source: CBK&apos;s own published auction results. Rows linked with an external-arrow icon open the original PDF;
          directly supplied CBK documents are shown without a link. This is the rate on accepted bids, which is what buyers received; it is not a
          secondary-market price and not a forecast.
        </p>
      </div>
    </div>
  );
}
