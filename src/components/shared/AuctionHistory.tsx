'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
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
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C" minTickGap={24} />
            <YAxis
              tick={{ fill: '#8B8676', fontSize: 11 }} stroke="#CBBD9C"
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={52} domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#FDFBF5', border: '1px solid #E3D8BE', borderRadius: 12, color: '#0A192F' }}
              labelStyle={{ color: '#8B8676' }}
              formatter={(v: number) => [`${v.toFixed(2)}%`, 'Auction cleared at']}
              labelFormatter={(l, p) => p?.[0]?.payload?.date ?? l}
            />
            <ReferenceLine y={history.latest.rate} stroke="#CBBD9C" strokeDasharray="4 4" />
            {/* Straight segments, not a curve: between two auctions nothing was
                measured, so a smooth line would draw prices that were never
                observed. */}
            <Line
              type="linear" dataKey="rate" stroke="#0F766E" strokeWidth={2.5}
              dot={{ r: 3, fill: '#0F766E', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
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
          {[...history.points].reverse().map((p) => (
            <li key={p.date}>
              <a
                href={p.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-sand-100"
              >
                <span className="num shrink-0 tabular-nums text-ink-muted">{p.date}</span>
                <span className="num min-w-0 flex-1 font-semibold text-ink-soft">
                  {p.rate.toFixed(2)}%
                </span>
                {p.pricePer100 != null && (
                  <span className="num shrink-0 text-ink-faint">
                    at {p.pricePer100.toFixed(2)} per 100
                  </span>
                )}
                <ExternalLink size={11} className="shrink-0 text-ink-faint" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Source: CBK&apos;s own published auction results — each row links to the original PDF.
          This is the rate on accepted bids, which is what buyers received; it is not a
          secondary-market price and not a forecast.
        </p>
      </div>
    </div>
  );
}
