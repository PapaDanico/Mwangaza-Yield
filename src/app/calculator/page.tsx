'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Bond } from '@/types/bond';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { resolvePrice } from '@/lib/prices';
import { PriceBadge } from '@/components/shared/PriceProvenance';
import { computeBondInvestment, formatKES, formatPct, isYieldPinned, YTM_CEILING } from '@/lib/financial-engine';
import { nonNegativeNumber } from '@/lib/utils';
import { track } from '@/lib/analytics';
import DataState from '@/components/shared/DataState';
import AuctionHistory from '@/components/shared/AuctionHistory';
import LiveResult from '@/components/shared/LiveResult';
import RealYieldCard from '@/components/shared/RealYieldCard';

/**
 * Tax status first, because it is what actually separates these bonds for a
 * Kenyan saver: an IFB pays its coupon whole while everything else loses 10 or
 * 15 per cent to withholding tax. A 12.8% infrastructure bond beats a 13.2%
 * fixed-coupon one, and a flat alphabetical list hides that.
 */
const BOND_GROUPS: { label: string; of: (b: Bond) => boolean }[] = [
  { label: 'Infrastructure — tax-free', of: (b) => b.taxExempt },
  { label: 'Fixed coupon — taxed', of: (b) => !b.taxExempt && b.category !== 'SDB' },
  { label: 'Savings development — taxed', of: (b) => !b.taxExempt && b.category === 'SDB' },
];

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
  const macro = useBondStore((s) => s.macro);
  const userPrices = usePriceStore((s) => s.userPrices);
  const savePrice = usePriceStore((s) => s.setPrice);
  const [isin, setIsin] = useState('');
  const [amount, setAmount] = useState(1_000_000);
  const [price, setPrice] = useState(100);
  // Cleared whenever the price moves, so the confirmation always refers to the
  // number currently on screen rather than the last one saved.
  const [saved, setSaved] = useState(false);

  // bonds.json is ordered by maturity, so bonds[0] is whatever redeems SOONEST
  // — and defaulting to it meant every first-time visitor landed on the least
  // representative bond in the set. On one live dataset that was a bond 23 days
  // from redemption: its "yearly return" is dominated by an imminent repayment
  // rather than by its coupon, and nudging the price slider swung the answer
  // from 10.83% to 45.75% because a small discount over three weeks annualises
  // enormously. All correct arithmetic, and a terrible first impression of what
  // the tool does.
  //
  // Default instead to the best net yield with at least a year to run, which is
  // both representative and the number this app exists to surface.
  const defaultBond = useMemo(() => {
    const aYearOut = new Date();
    aYearOut.setFullYear(aYearOut.getFullYear() + 1);
    const longEnough = bonds.filter((b) => new Date(b.maturityDate) > aYearOut);
    const pool = longEnough.length ? longEnough : bonds;
    return pool.reduce<Bond | undefined>((best, b) => {
      const net = computeBondInvestment(b, 100_000, 100).netYTM;
      const bestNet = best ? computeBondInvestment(best, 100_000, 100).netYTM : -Infinity;
      return net > bestNet ? b : best;
    }, undefined);
  }, [bonds]);

  const bond = bonds.find((b) => b.isin === isin) ?? defaultBond;
  const lastTrade = secondary.find((t) => t.isin === bond?.isin);
  const priceInfo = useMemo(
    () => (bond ? resolvePrice(bond, secondary, userPrices) : null),
    [bond, secondary, userPrices]
  );

  // Start the slider at whatever we actually know about this bond — the price
  // the reader recorded, else the last print — instead of anchoring every visit
  // to par. Re-runs on bond change, which is the whole point: switching issues
  // used to silently carry the previous bond's price across.
  //
  // This deliberately does NOT clear `saved`. Saving a price mutates
  // `userPrices`, which produces a new `priceInfo`, which re-runs this effect —
  // so clearing the flag here wiped the "Saved." confirmation on the very tick
  // it was set, and the one piece of feedback that the price had been stored
  // was unreachable in normal use. `saved` is cleared where the reader actually
  // changes their mind: the slider and the bond selector.
  useEffect(() => {
    if (priceInfo) setPrice(priceInfo.price);
  }, [priceInfo]);

  const result = useMemo(
    () => (bond ? computeBondInvestment(bond, amount, price) : null),
    [bond, amount, price]
  );

  useEffect(() => {
    if (result) track('act:calculator-run');
  }, [result]);

  if (!bond) return <DataState />;

  // Zero is the empty field, not a bid of nothing, so it is not flagged — a
  // cleared box should read as "waiting", not as an error the reader made.
  const belowMinimum = amount > 0 && amount < bond.minInvestmentKES;

  // Never print the solver's own ceiling as though it were measured.
  const pct = (v: number) => (isYieldPinned(v) ? `over ${YTM_CEILING}%` : formatPct(v));

  // Both yields pinned means both stopped at the same ceiling, so their
  // difference is zero by construction — not because tax took nothing. Printing
  // "0.00 pp" there tells a taxed bondholder their tax is free.
  const taxDrag = (gross: number, net: number, bps: number) =>
    isYieldPinned(gross) && isYieldPinned(net)
      ? 'not measurable at this price'
      : `${(bps / 100).toFixed(2)} pp`;

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
              onChange={(e) => { setIsin(e.target.value); setPrice(100); setSaved(false); }}
              className={inputCls}
            >
              {/*
                Grouped, because 58 options in one flat list is a wall of issue
                codes — and the single most useful fact when choosing, that a
                bond is tax-free, was buried in a suffix at the end of each row.
                optgroup is native, so it costs nothing and works with the
                platform pickers on Android and iOS rather than against them.
                The maturity year is in the label for the same reason: two bonds
                can share a coupon and differ by fifteen years.
              */}
              {BOND_GROUPS.map(({ label, of }) => {
                const inGroup = bonds.filter(of);
                if (!inGroup.length) return null;
                return (
                  <optgroup key={label} label={`${label} (${inGroup.length})`}>
                    {inGroup.map((b) => (
                      <option key={b.isin} value={b.isin}>
                        {b.issueCode} — {b.couponRate}%, matures {b.maturityDate.slice(0, 4)}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="calc-amount" className="mb-1 block text-sm font-medium text-ink-soft">
              Investment amount (face value)
            </label>
            <input
              id="calc-amount"
              type="number" min={bond.minInvestmentKES} step={50000} value={amount}
              onChange={(e) => setAmount(nonNegativeNumber(e.target.value))}
              aria-invalid={belowMinimum || undefined}
              aria-describedby="calc-amount-min"
              className={`num ${inputCls} ${belowMinimum ? 'border-gold-500' : ''}`}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[100_000, 500_000, 1_000_000, 5_000_000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  // 44px minimum: these amount presets are the fastest way into
                  // the calculator and were 55x26, small enough to mis-tap on a
                  // phone — which is the device this app is built for.
                  className={`num min-h-[44px] rounded-full border px-4 py-1 text-xs transition ${
                    amount === v
                      ? 'border-gold-600 bg-gold-500/15 text-gold-700'
                      : 'border-sand-400 text-ink-muted hover:border-ink-muted'
                  }`}
                >
                  {v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1_000}k`}
                </button>
              ))}
            </div>
            {/*
              This line used to be grey and passive: it said "Minimum Ksh 50,000"
              and then let the page quote a full plan for one shilling — coupon,
              yield, dirty price and all. Stating a rule and ignoring it is worse
              than not stating it, because the reader takes the silence as
              consent and the arithmetic as an order they could place.

              It still computes. Someone comparing bonds at a round Ksh 10,000
              is doing something reasonable, and refusing to answer would be
              obstruction. What changes is that the figures no longer pretend to
              be purchasable. The minimum is per bond — two of the infrastructure
              bonds are 100,000 — so it is read from the record rather than
              written in.
            */}
            <p
              id="calc-amount-min"
              className={`mt-2 text-xs ${belowMinimum ? 'text-gold-700' : 'text-ink-faint'}`}
            >
              {belowMinimum ? (
                <>
                  {formatKES(amount)} is below the {formatKES(bond.minInvestmentKES)} minimum for
                  this bond, so CBK would not accept a bid this size. The figures below are
                  arithmetic on the amount you typed, not an order you could place.
                </>
              ) : (
                <>Minimum {formatKES(bond.minInvestmentKES)}</>
              )}
            </p>
          </div>

          <div>
            <label htmlFor="calc-price" className="mb-1 flex justify-between text-sm font-medium text-ink-soft">
              <span className="flex items-center gap-1.5">
                Price you would pay (per 100)
                {priceInfo && <PriceBadge info={priceInfo} />}
              </span>
              <span className="num text-gold-700">{price.toFixed(2)}</span>
            </label>
            <input
              id="calc-price"
              type="range" min={70} max={120} step={0.05} value={price}
              onChange={(e) => { setPrice(Number(e.target.value)); setSaved(false); }}
              className="h-11 w-full cursor-pointer accent-gold-600"
            />

            {/* The slider was a dead end: someone looked a price up, dragged to
                it, read the yield and lost the number the moment they left. The
                ladder and every goal plan went on quoting par for the same
                bond. Keeping it costs one tap and makes the whole app agree. */}
            {bond && Math.abs(price - (priceInfo?.price ?? 100)) > 0.005 && (
              <button
                onClick={async () => {
                  const ok = await savePrice({
                    isin: bond.isin,
                    price,
                    observedOn: new Date().toISOString().slice(0, 10),
                  });
                  setSaved(ok);
                  if (ok) track('act:price-saved');
                }}
                className="mt-2 min-h-[44px] rounded-xl bg-ink px-4 py-2 text-xs font-medium text-sand-50 hover:bg-ink-soft"
              >
                Keep {price.toFixed(2)} as this bond&apos;s price
              </button>
            )}
            {saved && (
              <p className="mt-1.5 text-[11px] text-emerald-800">
                Saved. Your ladder and goal plans now price {bond?.issueCode} at{' '}
                <span className="num">{price.toFixed(2)}</span>.
              </p>
            )}
            {priceInfo?.source === 'user' ? (
              <p className="mt-1 text-xs text-ink-muted">
                Using the price you recorded on {priceInfo.asOfDate}
                {priceInfo.stale && ' — over a month old, worth checking'}.{' '}
                <a href="/prices/" className="text-gold-700 underline-offset-2 hover:underline">
                  Price book
                </a>
              </p>
            ) : lastTrade ? (
              <button
                onClick={() => { setPrice(lastTrade.price); setSaved(false); }}
                className="mt-1 text-xs text-gold-700 underline-offset-2 hover:underline"
              >
                Use last traded price: {lastTrade.price.toFixed(2)} ({lastTrade.tradeDate})
              </button>
            ) : (
              // Silence here would be the dishonest option: 100 looks like a
              // market price and is really just a default. We hold no market
              // prices at all — the app is built on CBK, Treasury and KNBS data
              // and nothing else — so the only price that can be right is the
              // one the reader is actually being offered.
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                We are showing <span className="num">100</span> because we hold no price for this
                bond — that is a placeholder, not the market. We publish no market prices at all.
                Set the slider to the price you paid, or the one your broker or DhowCSD quotes
                you, and keep it — it stays on your phone, and every other page will use it too.
              </p>
            )}
          </div>
        </div>

        {result && (
          <div className="card">
            <LiveResult>
              {`${bond.issueCode} at a price of ${price.toFixed(2)}: you keep ${pct(result.netYTM)} a year after tax, `
                + `${formatKES(result.netCouponPerPeriodKES)} every six months, for a total outlay of `
                + `${formatKES(result.settlementCostKES)}.`}
            </LiveResult>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-ink">{bond.issueCode}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${bond.taxExempt ? 'bg-mint-500/15 text-mint-700' : 'bg-sand-200 text-ink-soft'}`}>
                Tax {formatPct(result.whtRate * 100, 0)}
              </span>
            </div>
            <Row label="What you actually earn" value={pct(result.netYTM)} accent
              hint="Your yearly return after tax, if you hold this bond to the end. This is the number to compare against anything else." />
            <Row label="Before tax" value={pct(result.grossYTM)}
              hint="The figure most places quote. It is not what you keep." />
            <Row label="Lost to tax" value={taxDrag(result.grossYTM, result.netYTM, result.taxDragBps)}
              hint="The gap between the two figures above. Infrastructure bonds have none." />
            <Row label="Interest owed to the seller" value={result.accruedInterestPer100.toFixed(2)}
              hint="Per Ksh 100. Interest built up since the last payment — you repay it now and get it back at the next coupon." />
            <Row label="Price including that interest" value={result.dirtyPrice.toFixed(2)}
              hint="Called the dirty price. Per Ksh 100 of face value." />
            <Row label="Total you would pay" value={formatKES(result.settlementCostKES)}
              hint="What leaves your account on settlement day." />
            <Row label="Paid to you every six months" value={formatKES(result.netCouponPerPeriodKES)}
              hint="After tax." />
            <Row label="Paid to you each year" value={formatKES(result.netAnnualIncomeKES)} />
            <Row label="Yearly income as a % of your outlay" value={formatPct(result.currentYieldNet)}
              hint="Income only — it ignores any gain or loss when the bond is repaid." />
            <Row label="Next payment due" value={result.nextCouponDate ?? '—'}
              hint="Every 182 days from the issue date, which is why these always fall on a Monday." />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Accrued interest uses Actual/364, and coupon dates run in exact 182-day steps from
              issue — the basis Kenyan government bonds are built on, which is why a ten-year bond
              runs 3,640 days and every payment lands on a Monday. Yields are solved from your
              price on the remaining cash-flow schedule; net YTM taxes coupons at the WHT rate
              (principal redemption is untaxed).
            </p>
          </div>
        )}
      </div>

      {/* Everything above is nominal. This is what it is worth. */}
      {result && (
        <RealYieldCard
          bond={bond}
          netYTM={result.netYTM}
          grossYTM={result.grossYTM}
          macro={macro}
        />
      )}

      {/* The result above says what this bond pays. This says whether that is
          generous — the follow-up question, answered against the bond's own
          past rather than a benchmark the reader would have to learn first. */}
      <AuctionHistory issueCode={bond.issueCode} />
    </div>
  );
}
