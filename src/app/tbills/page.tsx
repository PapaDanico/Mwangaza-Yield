'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Info } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { computeTBill, projectRollover } from '@/lib/tbills';
import { formatKES, formatPct } from '@/lib/financial-engine';
import { formatCompactKES } from '@/lib/utils';
import DataState from '@/components/shared/DataState';

export default function TBillsPage() {
  const tbills = useBondStore((s) => s.tbills);
  const [amount, setAmount] = useState(500_000);
  const [tenor, setTenor] = useState<number | null>(null);
  const [rolloverMonths, setRolloverMonths] = useState(12);

  const sorted = useMemo(() => [...tbills].sort((a, b) => a.tenorDays - b.tenorDays), [tbills]);
  const selected = sorted.find((b) => b.tenorDays === tenor) ?? sorted[0];

  const result = useMemo(
    () => (selected ? computeTBill(amount, selected.discountRate, selected.tenorDays) : null),
    [selected, amount]
  );
  const rollover = useMemo(
    () => (selected ? projectRollover(amount, selected.discountRate, selected.tenorDays, rolloverMonths) : null),
    [selected, amount, rolloverMonths]
  );

  if (!selected || !result || !rollover) return <DataState label="Treasury bill" />;

  const inputCls =
    'w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold-500';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Lending for months, not years</h1>
        <p className="text-sm text-ink-muted">
          Treasury bills run 91, 182 or 364 days. You pay less than KES 100 now and are repaid
          the full 100 at the end — the gap is your interest. Sold every Thursday.
        </p>
      </div>

      {/* Rate cards: quoted vs what you actually earn */}
      <div className="grid gap-3 sm:grid-cols-3">
        {sorted.map((b) => {
          const r = computeTBill(100_000, b.discountRate, b.tenorDays);
          const active = b.tenorDays === selected.tenorDays;
          return (
            <button
              key={b.id}
              onClick={() => setTenor(b.tenorDays)}
              className={`card text-left transition ${active ? 'border-gold-500 ring-1 ring-gold-500' : 'hover:border-gold-500'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {b.tenorDays}-day
              </p>
              <p className="num mt-1 text-2xl font-bold text-gold-700">{formatPct(r.netEAY)}</p>
              <p className="text-xs text-ink-muted">net effective yield</p>
              <div className="mt-2 border-t border-sand-300 pt-2 text-[11px] text-ink-faint">
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

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <label htmlFor="tbill-amount" className="mb-1 block text-sm font-medium text-ink-soft">
              Investment amount (face value)
            </label>
            <input
              id="tbill-amount"
              type="number" min={selected.minInvestmentKES} step={50_000} value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className={`num ${inputCls}`}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[100_000, 500_000, 1_000_000, 5_000_000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={`num rounded-full border px-3 py-1 text-xs transition ${
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
              Minimum {formatKES(selected.minInvestmentKES)}, then multiples of KES 50,000 ·
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
          <h2 className="mb-3 font-semibold text-ink">{selected.tenorDays}-day bill breakdown</h2>
          {[
            ['What you actually earn', formatPct(result.netEAY), true],
            ['Before tax', formatPct(result.grossEAY), false],
            ['The advertised rate', formatPct(result.discountRate, 2), false],
            ['What you pay per KES 100', result.pricePer100.toFixed(2), false],
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
                className={`num rounded-full border px-3 py-1 text-xs transition ${
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
    </div>
  );
}
