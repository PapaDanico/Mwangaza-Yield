'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tag, Trash2 } from 'lucide-react';
import type { Bond } from '@/types/bond';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { resolvePrice, MIN_PRICE, MAX_PRICE, isPlausiblePrice } from '@/lib/prices';
import { computeBondInvestment, formatPct, isYieldPinned, YTM_CEILING } from '@/lib/financial-engine';
import DataState from '@/components/shared/DataState';
import { PriceBadge } from '@/components/shared/PriceProvenance';
import { benchmarkQuote } from '@/lib/quote-benchmark';
import { cn } from '@/lib/utils';

/**
 * The price book.
 *
 * We publish no market prices at all. This app is built on public CBK, National
 * Treasury and KNBS data, and exchange price data is none of those — it is
 * licensed, and we hold no licence, so we take none of it rather than lean on
 * being a use small enough that nobody minds.
 *
 * But the reader knows what they paid, or what they were quoted. That number is
 * theirs, it is the one their own return actually depends on, and it never
 * leaves their device. So we give them the place to write it down, and every
 * planner in the app reads from it.
 */
export default function PricesClient() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const userPrices = usePriceStore((s) => s.userPrices);
  const auctionResults = useBondStore((s) => s.auctionResults);
  const setPrice = usePriceStore((s) => s.setPrice);
  const removePrice = usePriceStore((s) => s.removePrice);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [observedOn, setObservedOn] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Set after mount: a build-time date would mismatch on hydration, and this
  // page is statically exported.
  const [todayISO, setTodayISO] = useState('');
  useEffect(() => setTodayISO(new Date().toISOString().slice(0, 10)), []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bonds
      .filter((b) => !q || b.issueCode.toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
      .map((b) => {
        const info = resolvePrice(b, secondary, userPrices);
        const daysToMaturity = Math.round(
          (new Date(b.maturityDate).getTime() - Date.now()) / 86_400_000
        );
        return {
          bond: b,
          info,
          daysToMaturity,
          netYTM: computeBondInvestment(b, 100_000, info.price).netYTM,
        };
      })
      // Bonds you have priced float to the top — this is your book, not a catalogue.
      .sort((a, b) => {
        const rank = (s: string) => (s === 'user' ? 0 : s === 'market' ? 1 : 2);
        return rank(a.info.source) - rank(b.info.source) || a.bond.maturityDate.localeCompare(b.bond.maturityDate);
      });
  }, [bonds, secondary, userPrices, query]);

  const priced = userPrices.length;

  // Never print the solver's own ceiling as though it were measured — the same
  // guard the calculator uses. Without it this page will happily render a
  // pinned solve as a flat figure.
  const pct = (v: number) => (isYieldPinned(v) ? `over ${YTM_CEILING}%` : formatPct(v));

  // A discount on paper that redeems in weeks annualises enormously: driving
  // the live app, a 92.50 price on a bond 60 days out printed 169.80% net,
  // which is arithmetically exact and reads like a fortune. The calculator
  // already refuses to DEFAULT to such a bond for this reason; a price book has
  // to list them all, so it says so beside the number instead.
  const SHORT_DATED_DAYS = 365;

  function beginEdit(bond: Bond, current: number) {
    setEditing(bond.isin);
    setDraft(current.toFixed(2));
    setObservedOn(todayISO);
    setNote(userPrices.find((p) => p.isin === bond.isin)?.note ?? '');
    setError('');
  }

  async function save(isin: string) {
    const value = Number(draft);
    if (!isPlausiblePrice(value)) {
      setError(`A bond price is quoted per 100 face. Enter something between ${MIN_PRICE} and ${MAX_PRICE}.`);
      return;
    }
    if (!observedOn) {
      setError('Which day did you see this price? It decides whether we flag it as stale later.');
      return;
    }
    const ok = await setPrice({ isin, price: value, observedOn, note });
    if (!ok) {
      setError('Could not save — private browsing blocks local storage on some devices.');
      return;
    }
    setEditing(null);
    setError('');
  }

  if (!bonds.length) return <DataState />;

  const inputCls =
    'min-h-11 w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2 text-sm text-ink outline-none focus:border-gold-500';

  return (
    <>

      <div className="card space-y-2">
        <p className="text-sm leading-relaxed text-ink-soft">
          We publish no market prices at all. This app is built only on public Central Bank of
          Kenya, National Treasury and KNBS data, and exchange price data is none of those — so
          the price of a bond is something only you can supply.
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          Use the price you actually paid, or the price your broker or DhowCSD quotes you. That is
          the number your own return depends on anyway, and it is more accurate for you than any
          published average.
        </p>
        <p className="text-[12px] leading-relaxed text-ink-faint">
          Prices you enter are stored only on this device, in the same local database as your
          holdings. They are never uploaded, and clearing your browser data removes them.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a bond by issue code"
          aria-label="Find a bond by issue code"
          className={`${inputCls} max-w-xs`}
        />
        <p className="text-sm text-ink-muted">
          <span className="num font-semibold text-ink">{priced}</span> of{' '}
          <span className="num">{bonds.length}</span> bonds priced
        </p>
      </div>

      <div className="space-y-2">
        {rows.map(({ bond, info, netYTM, daysToMaturity }) => (
          <div key={bond.isin} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{bond.issueCode}</p>
                <p className="text-[12px] text-ink-faint">
                  matures {bond.maturityDate} · {bond.couponRate.toFixed(3)}% coupon
                  {bond.taxExempt && ' · tax-free'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PriceBadge info={info} />
                <span className="num text-sm font-semibold text-ink">{info.price.toFixed(2)}</span>
                <span className="num text-sm text-gold-700">{pct(netYTM)} net</span>
              </div>
            </div>
            {/*
              Is this a good price?
              *
              * Only for a price the reader actually recorded — benchmarking the
              * par placeholder would be benchmarking our own guess, and the
              * answer would be about nothing.
              */}
            {info.source === 'user' && (() => {
              const mark = benchmarkQuote(bond, info.price, auctionResults, bonds);
              const tone =
                mark.verdict === 'above'
                  ? 'border-l-mint-600 bg-mint-500/5'
                  : mark.verdict === 'below'
                    ? 'border-l-gold-600 bg-gold-500/5'
                    : 'border-l-sand-400 bg-sand-100';
              return (
                <div className={cn('mt-2 rounded-r-lg border-l-4 px-3 py-2', tone)}>
                  <p className="text-[11px] font-semibold text-ink">
                    {mark.verdict === 'unknown'
                      ? 'No comparable auctions to price this against'
                      : mark.verdict === 'in-line'
                        ? `In line with recent auctions — ${pct(mark.impliedGrossYTM)} gross`
                        : `${pct(mark.impliedGrossYTM)} gross · ${mark.gapBps! > 0 ? '+' : ''}${mark.gapBps} bps vs recent auctions`}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{mark.summary}</p>
                </div>
              );
            })()}

            {daysToMaturity > 0 && daysToMaturity < SHORT_DATED_DAYS && (
              <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                Redeems in {daysToMaturity} days — at that range the yield is dominated by the
                repayment rather than the coupon, so a small discount annualises to a very large
                number. It is not an income you can hold.
              </p>
            )}

            {editing === bond.isin ? (
              <div className="mt-3 space-y-2 border-t border-sand-300 pt-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-ink-soft">
                      Price per 100
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={MIN_PRICE}
                      max={MAX_PRICE}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className={inputCls}
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-ink-soft">
                      Date you saw it
                    </span>
                    <input
                      type="date"
                      value={observedOn}
                      max={todayISO}
                      onChange={(e) => setObservedOn(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-ink-soft">
                    Where it came from (optional)
                  </span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Broker quote, price I paid…"
                    className={inputCls}
                  />
                </label>
                {error && <p className="text-[12px] font-medium text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => save(bond.isin)}
                    className="min-h-[44px] rounded-xl bg-ink px-4 py-2 text-sm font-medium text-sand-50 hover:bg-ink-soft"
                  >
                    Save price
                  </button>
                  <button
                    onClick={() => { setEditing(null); setError(''); }}
                    className="min-h-[44px] rounded-xl border border-sand-400 px-4 py-2 text-sm font-medium text-ink-muted hover:bg-sand-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // -my-1 keeps the row's visual height while the padding grows each
              // control to a 44px touch target. These are the two most repeated
              // taps in the app — 58 bonds, two actions each — and at 20px tall
              // they were under half the recommended minimum on the phones this
              // audience actually uses.
              <div className="-my-1 mt-1 flex items-center gap-1">
                <button
                  onClick={() => beginEdit(bond, info.price)}
                  className="flex min-h-[44px] items-center pr-3 text-sm font-medium text-gold-700 underline-offset-2 hover:underline"
                >
                  {info.source === 'user' ? 'Update price' : 'Record a price'}
                </button>
                {info.source === 'user' && (
                  <button
                    onClick={() => removePrice(bond.isin)}
                    className="inline-flex min-h-[44px] items-center gap-1 px-3 text-sm text-ink-faint hover:text-red-700"
                    aria-label={`Remove your price for ${bond.issueCode}`}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
                {info.note && <span className="text-[12px] text-ink-faint">{info.note}</span>}
              </div>
            )}
          </div>
        ))}
        {!rows.length && (
          <p className="card text-sm text-ink-muted">No bond matches “{query}”.</p>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-ink-faint">
        Prices feed the <Link href="/calculator/" className="underline underline-offset-2">calculator</Link>,{' '}
        <Link href="/ladder/" className="underline underline-offset-2">ladder</Link> and{' '}
        <Link href="/goals/" className="underline underline-offset-2">goal plans</Link>. A price older
        than 30 days is flagged for checking — Kenyan retail paper is thin, but a month can span a
        rate decision.
      </p>
    </>
  );
}
