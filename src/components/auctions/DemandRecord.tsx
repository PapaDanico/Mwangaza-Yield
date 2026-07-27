import { Gauge } from 'lucide-react';
import auctionsData from '../../../public/data/auction-results.json';
import type { AuctionPrint } from '@/types/bond';
import { demandSummary, RECENT_AUCTIONS } from '@/lib/subscription';
import { dispersionSummary } from '@/lib/bid-dispersion';
import Explain from '@/components/shared/Explain';

const PRINTS = auctionsData as unknown as AuctionPrint[];

/**
 * Whether the last year of auctions was fought over or ignored.
 *
 * A bidder deciding what rate to ask for is guessing at one thing: how much
 * competition there is. Every other figure on this page describes the bond.
 * This one describes the room.
 *
 * Two ratios, because either alone misleads. Bids against the offer says how
 * much money turned up. Acceptance against the offer says how much of it the
 * Treasury was willing to pay for. An auction bid twice over that took barely
 * the amount advertised was not short of demand — it refused the price.
 */
export default function DemandRecord() {
  const s = demandSummary(PRINTS);
  if (!s || s.medianSubscription === null) return null;
  const d = dispersionSummary(PRINTS);

  const x = (v: number) => `${v.toFixed(2)}x`;
  const rows = [...s.recent].reverse();
  const shortfall = s.medianSubscription < 1;

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <Gauge size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">How contested the recent auctions were</h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Across the last {s.recent.length} auctions, bids came to a median of{' '}
        <strong className="tabular-nums">{x(s.medianSubscription)}</strong> the amount
        offered, against{' '}
        <strong className="tabular-nums">{x(s.medianSubscriptionAllTime!)}</strong> over all{' '}
        {s.totalAuctions} auctions on record.{' '}
        {s.undersubscribed > 0 && (
          <>
            <strong>
              {s.undersubscribed} of {s.recent.length}
            </strong>{' '}
            did not attract the money on offer.
          </>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="pb-1 font-medium">Auction</th>
              <th className="pb-1 text-right font-medium">Offered</th>
              <th className="pb-1 text-right font-medium">Bid</th>
              <th className="pb-1 text-right font-medium">Taken</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.sourceUrl} className="border-t border-sand-200">
                <td className="py-1.5 text-ink-soft">
                  {a.auctionDate}
                  <span className="block text-[11px] text-ink-faint">
                    {a.issueCodes.join(', ') || '—'}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-soft">
                  {(a.offeredKESM / 1000).toFixed(0)}bn
                </td>
                <td
                  className={
                    'py-1.5 text-right tabular-nums font-semibold ' +
                    (a.subscription < 1 ? 'text-ink-soft' : 'text-ink')
                  }
                >
                  {x(a.subscription)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-soft">
                  {a.takeUp === null ? '—' : x(a.takeUp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {shortfall
          ? 'Auctions that fall short of the amount advertised tend to clear at higher rates, because the Treasury has to reach further to fill the book. That is good for a buyer and it is also the market telling you why.'
          : 'When bids run well above the amount offered, aggressive bids get rejected and the clearing rate settles lower. A non-competitive bid takes whatever that turns out to be.'}
      </p>

      {d && (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Bidders also disagree about price, and the auction says by how much. Across the
          last {d.points.length} sales the average rate asked across{' '}
          <em>all</em> bids ran{' '}
          <strong className="tabular-nums">{Math.round(d.recentMedianBps)} basis points</strong>{' '}
          above the average the Treasury actually accepted, against{' '}
          <strong className="tabular-nums">{Math.round(d.allTimeMedianBps)}</strong> over all{' '}
          {d.sampleSize} on record. That gap is the tail of bidders who asked for more than
          the government would pay and got nothing. A non-competitive bid sidesteps the
          question entirely — it takes the accepted average, whatever it turns out to be.
        </p>
      )}

      <Explain label="How this is counted, and what it cannot tell you">
        One row per auction document, not per bond. The offered amount is an auction-level
        figure that CBK repeats against every bond in a multi-bond sale, so dividing one
        bond&apos;s bids by it understates demand and counts the same auction twice — the 27 July
        2026 sale reads as 1.55x that way and was bid 2.15x. Two auctions held on the same
        day are two documents and stay separate.
        {' '}
        &ldquo;Taken&rdquo; is blank where CBK stated bids at face value and acceptance at cost.
        Those are one to two percent apart on a discount bond, and comparing across them
        would read a currency difference as a decision.
        {' '}
        The basis-point gap is the market weighted average rate minus the weighted average
        of accepted bids, both published by CBK, on sales only — in a buyback the government
        is the buyer and the gap runs the other way. It could not be measured before today:
        the parser had been reading the market row into both fields, so every gap was exactly
        zero in all 244 records that carried them.
        {' '}
        Median of the last {RECENT_AUCTIONS} auctions, shown beside the all-time median because
        one number alone is either too old or too thin. It is a record of demand that has
        already happened, and the next auction is bid by people who can see the same thing.
      </Explain>
    </div>
  );
}
