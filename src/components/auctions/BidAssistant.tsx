'use client';

/**
 * What should I bid?
 *
 * Shown inside an open or upcoming auction on the radar. Everything numerical
 * lives in src/lib/bid.ts and is pinned by tests to two measured traps: the
 * tenor label on a re-opened bond is not the tenor being bid, and bid-to-cover
 * is only meaningful grouped per auction. This component just lays the evidence
 * out and lets the reader test a rate against it.
 */

import { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import type { AuctionPrint, AuctionSchedule, Bond } from '@/types/bond';
import { normaliseCode } from '@/lib/auction-history';
import {
  GUIDANCE_FROM,
  bidGuidance,
  demandByAuction,
  describeDemand,
  readBid,
  yearsToMaturityAt,
  type BidVerdict,
} from '@/lib/bid';
import { cn } from '@/lib/utils';

const VERDICT_STYLES: Record<BidVerdict, string> = {
  aggressive: 'border-l-red-500 bg-red-500/5',
  competitive: 'border-l-mint-600 bg-mint-500/5',
  generous: 'border-l-gold-600 bg-gold-500/5',
  unknown: 'border-l-sand-400 bg-sand-100',
};

const VERDICT_LABEL: Record<BidVerdict, string> = {
  aggressive: 'Aggressive — risks rejection',
  competitive: 'Competitive',
  generous: 'Generous — likely filled, yield given away',
  unknown: 'Not enough evidence',
};

export function BidAssistant({
  auction,
  bonds,
  prints,
}: {
  auction: AuctionSchedule;
  bonds: Bond[];
  prints: AuctionPrint[];
}) {
  const [rateStr, setRateStr] = useState('');

  const { guidance, targetYears, reopening, demandLine } = useMemo(() => {
    // A re-opening keeps its original issue code, so if this code is already in
    // our bond list the reader is bidding on the REMAINING term, not the label.
    const known = bonds.find((b) => normaliseCode(b.issueCode) === normaliseCode(auction.issueCode));
    const target = known
      ? yearsToMaturityAt(known, new Date(auction.auctionDate))
      : auction.tenorYears;
    const g = bidGuidance(prints, bonds, target, {
      taxExempt: known ? known.taxExempt : auction.category === 'IFB',
    });
    return {
      guidance: g,
      targetYears: target,
      reopening: Boolean(known),
      demandLine: describeDemand(demandByAuction(prints)),
    };
  }, [auction, bonds, prints]);

  const rate = parseFloat(rateStr);
  // The calendar sometimes carries a placeholder before CBK announces the bond
  // ("TBA", tenor 0). There is no term to compare against yet, so say only
  // what can honestly be said: how hungry the market has been.
  if (targetYears <= 0) {
    return (
      <div className="mt-2 border-t border-sand-300 pt-3 sm:col-span-2">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-gold-700" />
          <h3 className="font-display text-sm font-semibold text-ink">What should I bid?</h3>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          CBK has not announced which bond this will be, so there is no maturity to compare against
          history yet. Check back once the prospectus is out.
        </p>
        {demandLine && <p className="mt-2 text-[11px] text-ink-faint">{demandLine}</p>}
      </div>
    );
  }

  const position = Number.isFinite(rate) && rate > 0 && rate < 100 ? readBid(rate, guidance) : null;

  return (
    <div className="mt-2 border-t border-sand-300 pt-3 sm:col-span-2">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-gold-700" />
        <h3 className="font-display text-sm font-semibold text-ink">What should I bid?</h3>
      </div>

      <p className="mt-1.5 text-xs text-ink-muted">
        {reopening ? (
          <>
            This is a <strong>re-opening</strong>: the code says {auction.tenorYears} years, but the
            paper has <span className="num font-semibold text-ink">{targetYears.toFixed(1)}</span>{' '}
            years left to run — so the history that matters is of paper with a similar remaining
            term, not other &ldquo;{auction.tenorYears}-year&rdquo; bonds.
          </>
        ) : (
          <>
            New issue of ~{targetYears.toFixed(0)}-year paper. Comparables below are past auctions of
            bonds with a similar remaining term at the time they were sold.
          </>
        )}
      </p>

      {guidance.thin ? (
        <p className="mt-3 rounded-xl bg-sand-100 p-3 text-xs text-ink-soft">
          Only {guidance.count} comparable auction{guidance.count === 1 ? '' : 's'} since{' '}
          {GUIDANCE_FROM}, even after widening the net to ±{guidance.toleranceYears} years. That is
          too few to quote a range honestly — check the prospectus and recent CBK results directly.
        </p>
      ) : (
        <>
          {/* The distribution: where comparable auctions actually cleared. */}
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-ink-faint">
              <span className="num">{guidance.low.toFixed(2)}%</span>
              <span className="num font-semibold text-ink-soft">median {guidance.median.toFixed(2)}%</span>
              <span className="num">{guidance.high.toFixed(2)}%</span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-sand-200">
              <div
                className="absolute h-2 rounded-full bg-gold-500/40"
                style={{
                  left: `${((guidance.p25 - guidance.low) / (guidance.high - guidance.low || 1)) * 100}%`,
                  width: `${((guidance.p75 - guidance.p25) / (guidance.high - guidance.low || 1)) * 100}%`,
                }}
              />
              <div
                className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink"
                style={{ left: `${((guidance.median - guidance.low) / (guidance.high - guidance.low || 1)) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              {guidance.count} auctions of paper within ±{guidance.toleranceYears}y of this term since{' '}
              {GUIDANCE_FROM}. Middle half cleared{' '}
              <span className="num">{guidance.p25.toFixed(2)}–{guidance.p75.toFixed(2)}%</span>.
              {guidance.latest && (
                <>
                  {' '}Most recent: <span className="num">{guidance.latest.clearingRate.toFixed(2)}%</span> on{' '}
                  {guidance.latest.auctionDate} ({guidance.latest.issueCode}).
                </>
              )}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label htmlFor={`bid-${auction.id}`} className="text-xs text-ink-muted">
              Test a rate:
            </label>
            <input
              id={`bid-${auction.id}`}
              inputMode="decimal"
              placeholder={guidance.median.toFixed(2)}
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              className="num w-24 rounded-lg border border-sand-300 bg-white px-2 py-1 text-sm text-ink outline-none focus:border-gold-600"
            />
            <span className="text-xs text-ink-faint">%</span>
          </div>

          {position && (
            <div className={cn('mt-2 rounded-r-xl border-l-4 p-3', VERDICT_STYLES[position.verdict])}>
              <p className="text-xs font-semibold text-ink">{VERDICT_LABEL[position.verdict]}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{position.detail}</p>
            </div>
          )}
        </>
      )}

      {demandLine && <p className="mt-3 text-[11px] text-ink-faint">{demandLine}</p>}

      <p className="mt-2 text-[11px] text-ink-faint">
        History, not advice. Non-competitive bids (up to KES 50M) take the weighted average rate and
        skip this question entirely — usually the right choice for retail.
      </p>
    </div>
  );
}
