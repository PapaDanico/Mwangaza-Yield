'use client';

import { useMemo, useState } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { computeBondInvestment, formatKES, formatPct } from '@/lib/financial-engine';

function Row({ label, value, accent, hint }: {
  label: string; value: string; accent?: boolean; hint?: string;
}) {
  return (
    <div className="border-b border-sand-300/70 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className={`num shrink-0 text-sm font-semibold ${accent ? 'text-base text-gold-700' : 'text-ink'}`}>
          {value}
        </span>
      </div>
      {hint && <p className="mt-0.5 max-w-[34ch] text-[11px] leading-snug text-ink-faint">{hint}</p>}
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

  const inputCls =
    'w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold-500';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">What would this bond pay me?</h1>
        <p className="text-sm text-ink-muted">
          Pick a bond, say how much you would put in, and see what actually reaches you once
          Kenyan tax is taken off.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <label htmlFor="calc-bond" className="mb-1 block text-sm font-medium text-ink-soft">Bond</label>
            <select
              id="calc-bond"
              value={bond.isin}
              onChange={(e) => { setIsin(e.target.value); setPrice(100); }}
              className={inputCls}
            >
              {bonds.map((b) => (
                <option key={b.isin} value={b.isin}>
                  {b.issueCode} — {b.couponRate}% {b.taxExempt ? '(tax-free)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="calc-amount" className="mb-1 block text-sm font-medium text-ink-soft">
              Investment amount (face value)
            </label>
            <input
              id="calc-amount"
              type="number" min={bond.minInvestmentKES} step={50000} value={amount}
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
              Minimum {formatKES(bond.minInvestmentKES)}
            </p>
          </div>

          <div>
            <label htmlFor="calc-price" className="mb-1 flex justify-between text-sm font-medium text-ink-soft">
              <span>Price you would pay (per 100)</span>
              <span className="num text-gold-700">{price.toFixed(2)}</span>
            </label>
            <input
              id="calc-price"
              type="range" min={70} max={120} step={0.05} value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full accent-gold-600"
            />
            {lastTrade ? (
              <button
                onClick={() => setPrice(lastTrade.price)}
                className="mt-1 text-xs text-gold-700 underline-offset-2 hover:underline"
              >
                Use last traded price: {lastTrade.price.toFixed(2)} ({lastTrade.tradeDate})
              </button>
            ) : (
              // Silence here would be the dishonest option: 100 looks like a
              // market price and is really just a default. The NSE terms permit
              // the USER to look a price up for personal use — they simply do
              // not permit us to fetch it for them. So we say so and hand them
              // the link.
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                We are showing <span className="num">100</span> because we have no traded price
                for this bond — that is a placeholder, not the market. The Nairobi Securities
                Exchange licenses its prices and does not permit us to republish them, but you
                may look one up for your own use:{' '}
                <a
                  href="https://www.nse.co.ke/dataservices/market-statistics/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-700 hover:underline"
                >
                  NSE Market Statistics
                </a>
                . Drag the slider to whatever you find — it stays on your phone.
              </p>
            )}
          </div>
        </div>

        {result && (
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-ink">{bond.issueCode}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${bond.taxExempt ? 'bg-mint-500/15 text-mint-700' : 'bg-sand-200 text-ink-soft'}`}>
                Tax {formatPct(result.whtRate * 100, 0)}
              </span>
            </div>
            <Row label="What you actually earn" value={formatPct(result.netYTM)} accent
              hint="Your yearly return after tax, if you hold this bond to the end. This is the number to compare against anything else." />
            <Row label="Before tax" value={formatPct(result.grossYTM)}
              hint="The figure most places quote. It is not what you keep." />
            <Row label="Lost to tax" value={`${(result.taxDragBps / 100).toFixed(2)} pp`}
              hint="The gap between the two figures above. Infrastructure bonds have none." />
            <Row label="Interest owed to the seller" value={result.accruedInterestPer100.toFixed(2)}
              hint="Per KES 100. Interest built up since the last payment — you repay it now and get it back at the next coupon." />
            <Row label="Price including that interest" value={result.dirtyPrice.toFixed(2)}
              hint="Called the dirty price. Per KES 100 of face value." />
            <Row label="Total you would pay" value={formatKES(result.settlementCostKES)}
              hint="What leaves your account on settlement day." />
            <Row label="Paid to you every six months" value={formatKES(result.netCouponPerPeriodKES)}
              hint="After tax." />
            <Row label="Paid to you each year" value={formatKES(result.netAnnualIncomeKES)} />
            <Row label="Yearly income as a % of your outlay" value={formatPct(result.currentYieldNet)}
              hint="Income only — it ignores any gain or loss when the bond is repaid." />
            <Row label="Next payment due" value={result.nextCouponDate ?? '—'}
              hint="Estimated by adding six months to the issue date; CBK shifts payments off weekends and holidays." />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
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
