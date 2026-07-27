import auctionsData from '../../../public/data/auction-results.json';
import type { AuctionPrint } from '@/types/bond';
import {
  MATURITY_APPROXIMATION_MEDIAN_ERROR_DAYS,
  REINVESTMENT_WINDOW_FROM_YEAR,
  reinvestmentAvailability,
} from '@/lib/reinvestment';
import Explain from '@/components/shared/Explain';

const PRINTS = auctionsData as unknown as AuctionPrint[];

/**
 * What was actually on offer, as against what the borrower says it intends.
 *
 * The card above this one reports the debt strategy: more bonds, longer bonds.
 * That is a stated plan, and a ladder does not roll into a plan — it rolls
 * into whatever is at the next auction. This one counts what has been.
 *
 * The answer is the strategy seen from the holder's end. Lengthening the
 * average maturity of the domestic stock means short paper gets issued less
 * often, and a ladder's short rungs are the ones that mature first. The plan
 * and the difficulty are the same fact.
 */
export default function ReinvestmentEvidence() {
  const availability = reinvestmentAvailability(PRINTS);
  const observed = availability[0]?.monthsObserved ?? 0;
  if (!observed) return null;

  const pct = (share: number) => Math.round(share * 100);
  const short = availability.find((a) => a.band.id === 'short');

  return (
    <div className="no-print card border border-sand-300">
      <h2 className="font-semibold text-ink">What was actually on offer</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        A ladder rolls each rung into whatever the next auction sells, not into what the
        strategy says. Across{' '}
        <strong>
          {observed} months since {REINVESTMENT_WINDOW_FROM_YEAR}
        </strong>
        , this is how often a bond of each remaining term was on offer at all.
      </p>

      <ul className="mt-3 space-y-2">
        {availability.map((a) => (
          <li key={a.band.id} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">{a.band.label}</span>
              <span className="tabular-nums font-semibold text-ink">
                {pct(a.share)}% of months
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sand-200"
              role="img"
              aria-label={`${a.band.label}: offered in ${a.monthsOffered} of ${a.monthsObserved} months`}
            >
              <div
                className="h-full rounded-full bg-gold-600"
                style={{ width: `${Math.max(pct(a.share), 1)}%` }}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {a.monthsOffered} of {a.monthsObserved} months · {a.auctions} auction
              {a.auctions === 1 ? '' : 's'}
            </p>
          </li>
        ))}
      </ul>

      {short && (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          The short end is the thin one. A rung maturing into a month with no short bond on
          offer does not lose money — it waits, in cash, earning nothing, until something is
          issued. That waiting is the cost the yield figure never shows.
        </p>
      )}

      <Explain label="How this is counted, and what it cannot tell you">
        Every auction this project has parsed since {REINVESTMENT_WINDOW_FROM_YEAR}, placed in a
        band by how long the bond had left to run on the day it was auctioned. Counted in months
        rather than auctions, because a reader whose rung matures in March needs to know whether
        March usually offers anything — not how many auctions happened in total.
        {' '}
        Remaining term is derived from the issue code, which carries the issue year and the tenor
        but not the day; measured against every bond where the real maturity is known, that
        approximation is off by about {MATURITY_APPROXIMATION_MEDIAN_ERROR_DAYS} days, which
        matters only at a band boundary.
        {' '}
        It is a record, not a forecast. The Treasury can issue whatever it likes next month, and
        a share of past months is not a probability for the one your rung matures in.
      </Explain>
    </div>
  );
}
