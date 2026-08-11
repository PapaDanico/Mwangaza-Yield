'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Info } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { realTerms } from '@/lib/real-terms';
import { computeTBill, projectRollover } from '@/lib/tbills';
import { formatKES, formatPct } from '@/lib/financial-engine';
import { formatCompactKES, nonNegativeNumber } from '@/lib/utils';
import DataState from '@/components/shared/DataState';
import FollowChannel from '@/components/shared/FollowChannel';
import LiveResult from '@/components/shared/LiveResult';
import { inputCls } from '@/lib/field-styles';

export default function TbillsClient() {
  const tbills = useBondStore((s) => s.tbills);
  const macro = useBondStore((s) => s.macro);
  const [amount, setAmount] = useState(500_000);
  const [tenor, setTenor] = useState<number | null>(null);
  const [rolloverMonths, setRolloverMonths] = useState(12);

  const sorted = useMemo(() => [...tbills].sort((a, b) => a.tenorDays - b.tenorDays), [tbills]);
  const selected = sorted.find((b) => b.tenorDays === tenor) ?? sorted[0];

  const result = useMemo(
    () => (selected ? computeTBill(amount, selected.discountRate, selected.tenorDays) : null),
    [selected, amount]
  );
  /* Recomputed only when the net yield or the CPI print changes — not on every
     keystroke in the amount box, which does not move either. */
  const real = useMemo(
    () => (result ? realTerms(result.netEAY, macro) : null),
    [result, macro]
  );
  const rollover = useMemo(
    () => (selected ? projectRollover(amount, selected.discountRate, selected.tenorDays, rolloverMonths) : null),
    [selected, amount, rolloverMonths]
  );

  if (!selected || !result || !rollover) return <DataState label="Treasury bill" />;

  return (
    <>

      {/* Rate cards: quoted vs what you actually earn */}
      {/*
        Three across even on the narrowest phone. Stacked, these cards ran 504px
        — measured at 380px wide — which put the amount box at y=942 in a 900px
        viewport: the calculator this page exists for was entirely below the
        fold, behind three cards the user had not asked to read. Comparing
        tenors is also the point of them, and you cannot compare what you have
        to scroll between. The secondary lines fold away below `sm` so the
        headline net yield still has room to breathe.
      */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {sorted.map((b) => {
          const r = computeTBill(100_000, b.discountRate, b.tenorDays);
          const active = b.tenorDays === selected.tenorDays;
          return (
            <button
              key={b.id}
              onClick={() => setTenor(b.tenorDays)}
              className={`card p-3 text-left transition sm:p-4 ${active ? 'border-gold-500 ring-1 ring-gold-500' : 'hover:border-gold-500'}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:text-xs">
                {b.tenorDays}-day
              </p>
              <p className="num mt-1 text-lg font-bold text-gold-700 sm:text-2xl">{formatPct(r.netEAY)}</p>
              <p className="text-[11px] text-ink-muted sm:text-xs">
                net <span className="hidden sm:inline">effective </span>yield
              </p>
              {/* Detail on a phone costs more than it gives: it is the third and
                  fourth number on a card whose job is to be compared at a
                  glance, and it is repeated in full in the breakdown below. */}
              <div className="mt-2 hidden border-t border-sand-300 pt-2 text-[11px] text-ink-faint sm:block">
                <p className="num">Quoted rate {formatPct(b.discountRate, 4)}</p>
                <p className="num">Gross yield {formatPct(r.grossEAY)}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="card flex gap-3 border-l-4 border-l-gold-500">
        <Info size={18} className="mt-0.5 shrink-0 text-gold-700" />
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">The quoted rate is not what you earn.</span>{' '}
          T-bills are sold at a discount, so the true gross yield runs{' '}
          <span className="num">{result.quoteGapBps.toFixed(0)}</span> bps <em>above</em> the{' '}
          {formatPct(selected.discountRate, 4)} headline — then 15% withholding tax pulls the net
          to <span className="num font-semibold text-gold-700">{formatPct(result.netEAY)}</span>.
        </p>
      </div>

      {/* WHAT IS LEFT AFTER PRICES — the layer, not a curiosity.
        *
        * The card above ends at the net yield, which is where every figure on
        * this site has stopped. A reader seeing 11.56% net reasonably concludes
        * they are getting meaningfully richer; at a mid-six CPI print they are
        * getting richer by about half that. The app already held both numbers
        * and never put them in the same sentence — the CPI sat on the macro
        * panel as a standalone curiosity beside the shilling.
        *
        * `realTerms` returns null when there is no CPI or the print is stale,
        * and this renders nothing in that case rather than deflating by a
        * figure it cannot stand behind. */}
      {real && (
        <div className="card flex gap-3 border-l-4 border-l-ink">
          <Info size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">And prices rose too.</span>{' '}
            With inflation at <span className="num">{formatPct(real.inflationPct)}</span> (KNBS,{' '}
            {real.inflationAsOf}), the {selected.tenorDays}-day bill&apos;s{' '}
            <span className="num">{formatPct(real.netPct)}</span> net leaves{' '}
            <span
              className={`num font-semibold ${real.losesToInflation ? 'text-red-600' : 'text-mint-700'}`}
            >
              {formatPct(real.realPct)}
            </span>{' '}
            {real.losesToInflation
              ? 'after prices — this bill loses you buying power.'
              : 'in real buying power.'}{' '}
            <span className="text-ink-faint">
              Compounded, not subtracted: {formatPct(real.netPct)} − {formatPct(real.inflationPct)}{' '}
              would read {formatPct(real.netPct - real.inflationPct)} and overstate it.
            </span>
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <label htmlFor="tbill-amount" className="mb-1 block text-sm font-medium text-ink-soft">
              Investment amount (face value)
            </label>
            <input
              id="tbill-amount"
              type="number" min={selected.minInvestmentKES} step={50_000} value={amount}
              onChange={(e) => setAmount(nonNegativeNumber(e.target.value))}
              className={`num ${inputCls}`}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[100_000, 500_000, 1_000_000, 5_000_000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={`num inline-flex min-h-11 items-center rounded-full border px-4 py-1 text-xs transition ${
                    amount === v
                      ? 'border-gold-600 bg-gold-500/15 text-gold-700'
                      : 'border-sand-400 text-ink-muted hover:border-ink-muted'
                  }`}
                >
                  {v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}k`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Minimum {formatKES(selected.minInvestmentKES)}, then multiples of Ksh 50,000 ·
              next auction {selected.nextAuctionDate}
            </p>
          </div>

          <div className="rounded-xl bg-sand-200 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">You pay today</span>
              <span className="num font-semibold text-ink">{formatKES(result.costKES)}</span>
            </div>
            <div className="my-2 flex justify-center text-ink-faint">
              <ArrowRight size={16} className="rotate-90" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">You receive in {selected.tenorDays} days</span>
              <span className="num font-semibold text-mint-700">{formatKES(result.netProceedsKES)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <LiveResult>
            {`${selected.tenorDays}-day bill: you keep ${formatPct(result.netEAY)} a year after tax, `
              + `${formatKES(result.netInterestKES)} in interest, `
              + `${formatKES(result.netProceedsKES)} back in ${selected.tenorDays} days.`}
          </LiveResult>
          <h2 className="mb-3 font-semibold text-ink">{selected.tenorDays}-day bill breakdown</h2>
          {[
            ['What you actually earn', formatPct(result.netEAY), true],
            ['Before tax', formatPct(result.grossEAY), false],
            ['The advertised rate', formatPct(result.discountRate, 2), false],
            ['What you pay per Ksh 100', result.pricePer100.toFixed(2), false],
            ['Interest earned', formatKES(result.grossInterestKES), false],
            ['Tax taken off (15%)', `−${formatKES(result.whtKES)}`, false],
            ['Interest you keep', formatKES(result.netInterestKES), false],
            // Named and scaled to match the calculator — the same concept must
            // not appear as "Tax drag / bps" on one page and "Lost to tax / pp"
            // on another.
            ['Lost to tax', `${(result.taxDragBps / 100).toFixed(2)} pp`, false],
          ].map(([label, value, accent]) => (
            <div key={label as string} className="flex items-baseline justify-between border-b border-sand-300/70 py-2 last:border-0">
              <span className="text-sm text-ink-muted">{label as string}</span>
              <span className={`num text-sm font-semibold ${accent ? 'text-base text-gold-700' : 'text-ink'}`}>
                {value as string}
              </span>
            </div>
          ))}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Discount basis: rate × days ÷ 365. Effective yield compounds the discount over a year;
            withholding tax applies to interest only. Rates are the last auction&apos;s weighted
            average ({selected.source}) — the next auction will clear differently.
          </p>
        </div>
      </div>

      {/* Rollover ladder */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <RefreshCw size={16} className="text-gold-700" /> Rollover projection
            </h2>
            <p className="text-xs text-ink-muted">
              Reinvesting net proceeds each maturity for {rolloverMonths} months
            </p>
          </div>
          <div className="flex gap-1.5">
            {[6, 12, 24, 36].map((m) => (
              <button
                key={m}
                onClick={() => setRolloverMonths(m)}
                className={`num inline-flex min-h-11 items-center rounded-full border px-4 py-1 text-xs transition ${
                  rolloverMonths === m
                    ? 'border-gold-600 bg-gold-500/15 text-gold-700'
                    : 'border-sand-400 text-ink-muted hover:border-ink-muted'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Cycles</p>
            <p className="num mt-1 text-lg font-bold text-ink">{rollover.cycles}</p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Net interest earned</p>
            <p className="num mt-1 text-lg font-bold text-mint-700">
              {formatCompactKES(rollover.totalNetInterestKES)}
            </p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Ends at</p>
            <p className="num mt-1 text-lg font-bold text-gold-700">
              {formatCompactKES(rollover.finalValueKES)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Assumes the {formatPct(selected.discountRate, 4)} rate holds at every roll — the central
          risk of a rollover strategy. Rates reset weekly at auction, so a falling-rate cycle
          reduces the return shown here. Compare against locking a longer bond on the{' '}
          <a href="/ladder/" className="text-gold-700 underline-offset-2 hover:underline">Ladder Builder</a>.
        </p>
      </div>

      {/* Placed HERE, past the `if (!selected || !result || !rollover)` guard
        * on line 38, so it can only render once a reader has actually been
        * given a bill comparison. That is the placement rule, not a layout
        * preference — see FollowChannel's header. */}
      <FollowChannel what="Bill rates" />
    </>
  );
}
