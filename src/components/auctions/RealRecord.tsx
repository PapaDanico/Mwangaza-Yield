import { TrendingUp } from 'lucide-react';
import auctionsData from '../../../public/data/auction-results.json';
import cpiData from '../../../public/data/cpi-history.json';
import type { AuctionPrint } from '@/types/bond';
import {
  sovereignReadings,
  summariseSovereign,
  type CpiPoint,
  type SovereignPrint,
} from '@/lib/sovereign-record';
import Explain from '@/components/shared/Explain';

const PRINTS = auctionsData as unknown as SovereignPrint[];
const CPI = cpiData as unknown as CpiPoint[];

/**
 * Has lending to this government ever actually been a good place to keep money?
 *
 * Every other figure on this page is about the auction in front of you. This
 * one is about the instrument, and it is the question a first-time saver asks
 * before any of the others: a 13% yield means nothing without knowing what 13%
 * did to a shilling in the years it was paid.
 *
 * The answer turns out to be worth showing. Across 312 auctions since 2010,
 * government paper lost to inflation in eleven of them. The typical auction
 * left about 5.8% after tax and after prices. That is a stronger record than
 * the "inflation eats your savings" framing most Kenyans meet first — and the
 * eleven exceptions sit in 2011, 2012 and 2017 rather than being spread across
 * the span, which is the honest caveat and the reason the worst reading is
 * named rather than averaged away.
 *
 * That caveat was written by hand first, as "almost entirely in 2011", read
 * off the worst reading's year. It was wrong: five fall in 2011, four in 2012
 * and two in 2017. The years are now derived in `summariseSovereign` and
 * rendered, because a sentence about clustering is a factual claim about the
 * data even when it reads as colour.
 *
 * Static imports, not the store. A store-gated component pre-renders empty
 * under `output: export`, which is how the QEBR panel shipped built, tested
 * and invisible.
 */
/** "2011, 2012 and 2017" — an Oxford-comma-free list a reader can scan. */
function listYears(years: string[]): string {
  if (years.length <= 1) return years[0] ?? '';
  return `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;
}

export default function RealRecord() {
  const readings = sovereignReadings(PRINTS, CPI);
  const rec = summariseSovereign(readings);
  if (!rec || !rec.worst || !rec.best) return null;

  const pct = (v: number) => `${v.toFixed(2)}%`;
  const year = (d: string) => d.slice(0, 4);
  const beat = rec.readings - rec.losingReadings;

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className="text-mint-700" />
        <h2 className="font-display font-semibold text-ink">
          What government paper actually paid, after tax and after prices
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Across{' '}
        <strong className="tabular-nums">{rec.readings}</strong> auctions between{' '}
        {year(rec.from!)} and {year(rec.to!)}, the rate the market accepted beat
        inflation in <strong className="tabular-nums">{beat}</strong> of them. The
        typical auction left{' '}
        <strong className="tabular-nums">{pct(rec.medianRealPct)}</strong> once
        withholding tax and the inflation of the month it was sold in are both taken
        off.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-sand-100 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">
            Best on record
          </p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-mint-700">
            {pct(rec.best.realPct)}
          </p>
          <p className="text-sm text-ink-soft">
            {rec.best.issueCode} on {rec.best.date} — cleared at{' '}
            {pct(rec.best.grossPct)}
            {rec.best.whtRate === 0 && ' tax-free'} against{' '}
            {pct(rec.best.inflationPct)} inflation.
          </p>
        </div>
        <div className="rounded-lg bg-sand-100 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">
            Worst on record
          </p>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink">
            {pct(rec.worst.realPct)}
          </p>
          <p className="text-sm text-ink-soft">
            {rec.worst.issueCode} on {rec.worst.date} — cleared at{' '}
            {pct(rec.worst.grossPct)} against {pct(rec.worst.inflationPct)} inflation.
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        The losses are not spread evenly. All {rec.losingReadings} of them fall in{' '}
        {listYears(rec.losingYears)} — years when the headline rate looked generous and
        inflation ran ahead of it. That is the thing to watch for rather than a reason to
        dismiss the record: a high nominal rate during a spike in prices is not the same
        offer as the same rate when prices are calm.
      </p>

      <Explain label="How this is worked out, and where it is approximate">
        One reading per auction that CBK published a weighted average accepted rate for and
        that can be paired with an inflation print. Each auction is matched to the CPI in
        force <em>when it was held</em>, never to the latest print — matching everything to
        today&apos;s inflation would rewrite the whole history every month and would show
        2011&apos;s savers earning today&apos;s real return.
        {' '}
        Inflation is removed by the Fisher relation, not by subtraction. Subtracting is close
        and consistently wrong in the flattering direction; over three hundred readings that
        bias becomes a story about savers being better off than they were.
        {' '}
        Withholding is read from the issue code: infrastructure bonds are exempt, ten years
        and over pay 10%, shorter bonds pay 15%. A code the parser cannot read is taxed at the
        higher rate rather than the lower one.
        {' '}
        The net rate is the accepted rate less withholding, which is exact for a bond clearing
        at par and <em>understates</em> the return on one clearing below par — the pull back to
        par is a capital gain, and Kenyan withholding falls on interest. The approximation can
        only run against the saver, so every figure here is the conservative one.
        {' '}
        Auctions with no date, no accepted rate, or no inflation print within 45 days are left
        out rather than filled in, which is why the newest auction on this page may not yet
        appear here: CPI is published monthly and the reading waits for it. Rates outside a
        2–30% band are dropped as misparses — a shifted column reads a price per 100 as a yield.
        {' '}
        This is a record of what has already happened. It is not a forecast, and the auction in
        front of you is bid by people who can see the same history.
      </Explain>
    </div>
  );
}
