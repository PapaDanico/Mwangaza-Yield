'use client';

import { useMemo, useState } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { computeBondInvestment, formatKES, formatPct } from '@/lib/financial-engine';

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-700/40 py-2 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`num text-sm font-semibold ${accent ? 'text-gold-400 text-base' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

export default function CalculatorPage() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const [isin, setIsin] = useState('');
  const [amount, setAmount] = useState(1_000_000);
  const [price, setPrice] = useState(100);

  const bond = bonds.find((b) => b.isin === isin) ?? bonds[0];
  const lastTrade = secondary.find((t) => t.isin === bond?.isin);

  const result = useMemo(
    () => (bond ? computeBondInvestment(bond, amount, price) : null),
    [bond, amount, price]
  );

  if (!bond) return <div className="card h-64 animate-pulse" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Net Yield Calculator</h1>
        <p className="text-sm text-slate-400">
          After-tax economics of any listed bond — WHT applied per Kenyan tax law.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Bond</label>
            <select
              value={bond.isin}
              onChange={(e) => { setIsin(e.target.value); setPrice(100); }}
              className="w-full rounded-xl border border-slate-700 bg-treasury-navy px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500"
            >
              {bonds.map((b) => (
                <option key={b.isin} value={b.isin}>
                  {b.issueCode} — {b.couponRate}% {b.taxExempt ? '(tax-free)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Investment amount (face value)
            </label>
            <input
              type="number" min={bond.minInvestmentKES} step={50000} value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="num w-full rounded-xl border border-slate-700 bg-treasury-navy px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[100_000, 500_000, 1_000_000, 5_000_000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={`num rounded-full border px-3 py-1 text-xs transition ${
                    amount === v
                      ? 'border-gold-500 bg-gold-500/15 text-gold-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}k`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Minimum {formatKES(bond.minInvestmentKES)}
            </p>
          </div>

          <div>
            <label className="mb-1 flex justify-between text-sm font-medium text-slate-300">
              <span>Clean price (per 100)</span>
              <span className="num text-gold-400">{price.toFixed(2)}</span>
            </label>
            <input
              type="range" min={80} max={120} step={0.05} value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full accent-gold-500"
            />
            {lastTrade && (
              <button
                onClick={() => setPrice(lastTrade.price)}
                className="mt-1 text-xs text-gold-400 underline-offset-2 hover:underline"
              >
                Use last traded price: {lastTrade.price.toFixed(2)} ({lastTrade.tradeDate})
              </button>
            )}
          </div>
        </div>

        {result && (
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-white">{bond.issueCode}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${bond.taxExempt ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-300'}`}>
                WHT {formatPct(result.whtRate * 100, 0)}
              </span>
            </div>
            <Row label="Net yield (after tax)" value={formatPct(result.netYTM)} accent />
            <Row label="Gross yield (YTM)" value={formatPct(result.grossYTM)} />
            <Row label="Tax drag" value={`${result.taxDragBps.toFixed(0)} bps`} />
            <Row label="Accrued interest / 100" value={result.accruedInterestPer100.toFixed(4)} />
            <Row label="Dirty price" value={result.dirtyPrice.toFixed(4)} />
            <Row label="Total settlement cost" value={formatKES(result.settlementCostKES)} />
            <Row label="Semi-annual net coupon" value={formatKES(result.netCouponPerPeriodKES)} />
            <Row label="Net annual income" value={formatKES(result.netAnnualIncomeKES)} />
            <Row label="Net current yield" value={formatPct(result.currentYieldNet)} />
            <Row label="Next coupon date" value={result.nextCouponDate ?? '—'} />
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Accrued interest uses Actual/365. Yields are solved from your price on the remaining
              cash-flow schedule; net YTM taxes coupons at the WHT rate (principal redemption is
              untaxed). Coupon dates are estimated from the issue schedule — confirm exact dates in
              the prospectus.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
