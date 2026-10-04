import Link from 'next/link';
import { Target } from 'lucide-react';
import type { Prediction } from '@/lib/predictions';
import LEDGER from '../../../public/data/predictions.json';

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

/** The newest auction's rows: scored ones if any auction has been scored, plus
 *  the forecasts on record for auctions not yet held. Pure, for testing. */
export function latestForecasts(ledger: Prediction[]) {
  const scored = ledger.filter((p) => p.scoredOn !== undefined && p.actualRate !== undefined);
  const lastDate = scored.map((p) => p.auctionDate).sort().at(-1);
  const pending = ledger
    .filter((p) => p.scoredOn === undefined && p.excludedOn === undefined)
    .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
  return { last: lastDate ? scored.filter((p) => p.auctionDate === lastDate) : [], pending };
}

/**
 * The forecast ledger, brought to the dashboard.
 *
 * Every bond forecast is written down BEFORE bidding closes and scored against
 * CBK's published result (see TrackRecord on /auctions/). That record only
 * earns trust if readers see it, including the misses, so the newest result is
 * shown here as plainly as a hit. Built at compile time from the committed
 * ledger, so it server-renders and cannot shift the page on load.
 */
export default function LatestForecast() {
  const { last, pending } = latestForecasts(LEDGER as Prediction[]);
  if (last.length === 0 && pending.length === 0) return null;

  return (
    <section className="card" aria-labelledby="latest-forecast">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-gold-700" aria-hidden />
        <h2 id="latest-forecast" className="font-display font-semibold text-ink">
          Our forecast against the result
        </h2>
      </div>

      {last.length > 0 && (
        <>
          <p className="mt-1 text-sm text-ink-muted">Bond auction of {fmt(last[0].auctionDate)}</p>
          <ul className="mt-2 space-y-2">
            {last.map((p) => (
              <li key={p.issueCode} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-ink">{p.issueCode}</span>
                <span className="text-ink-soft">
                  forecast <span className="num">{p.low.toFixed(2)}–{p.high.toFixed(2)}%</span>, cleared at{' '}
                  <span className="num font-semibold text-ink">{p.actualRate!.toFixed(2)}%</span>
                </span>
                <span
                  className={
                    p.hitRange
                      ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                      : 'rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800'
                  }
                >
                  {p.hitRange ? 'Inside the range' : 'Outside the range'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft">
          On record before bidding closes:{' '}
          {pending.map((p, i) => (
            <span key={`${p.issueCode}-${p.auctionDate}`}>
              {i > 0 && '; '}
              {p.issueCode} on {fmt(p.auctionDate)},{' '}
              <span className="num">{p.low.toFixed(2)}–{p.high.toFixed(2)}%</span>
            </span>
          ))}
          .
        </p>
      )}

      <Link href="/auctions/" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-gold-700 underline-offset-2 hover:underline">
        The full track record, misses included
      </Link>
    </section>
  );
}
