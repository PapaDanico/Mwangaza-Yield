'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Tag, Trash2, ExternalLink } from 'lucide-react';
import type { Bond } from '@/types/bond';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { resolvePrice, MIN_PRICE, MAX_PRICE, isPlausiblePrice } from '@/lib/prices';
import { computeBondInvestment, formatPct } from '@/lib/financial-engine';
import DataState from '@/components/shared/DataState';
import { PriceBadge } from '@/components/shared/PriceProvenance';

/**
 * The price book.
 *
 * This page is the app's answer to a constraint it cannot legally remove. The
 * NSE will not let us publish prices; nothing stops the reader from looking one
 * up and writing it down. So we give them the place to write it down, and every
 * planner in the app reads from it.
 */
export default function PricesPage() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const userPrices = usePriceStore((s) => s.userPrices);
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
        return {
          bond: b,
          info,
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
    'w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2 text-sm text-ink outline-none focus:border-gold-500';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Tag size={22} className="text-gold-600" /> Your price book
        </h1>
        <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
          Every yield in this app is a function of what you pay. Where we have no price we use{' '}
          <span className="num">100</span>, which is a placeholder rather than the market and quietly
          flatters the numbers. Record what a bond actually costs and the calculator, ladder and
          every goal plan will use it instead.
        </p>
      </div>

      <div className="card space-y-2">
        <p className="text-sm leading-relaxed text-ink-soft">
          The Nairobi Securities Exchange licenses its price data and does not permit us to republish
          it — so we don&apos;t. You are free to look prices up for your own use.
        </p>
        <a
          href="https://www.nse.co.ke/dataservices/market-statistics/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-700 hover:underline"
        >
          NSE market statistics <ExternalLink size={14} />
        </a>
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
        {rows.map(({ bond, info, netYTM }) => (
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
                <span className="num text-sm text-gold-700">{formatPct(netYTM)} net</span>
              </div>
            </div>

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
                    placeholder="NSE daily list, broker quote…"
                    className={inputCls}
                  />
                </label>
                {error && <p className="text-[12px] font-medium text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => save(bond.isin)}
                    className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-sand-50 hover:bg-ink-soft"
                  >
                    Save price
                  </button>
                  <button
                    onClick={() => { setEditing(null); setError(''); }}
                    className="rounded-xl border border-sand-400 px-4 py-2 text-sm font-medium text-ink-muted hover:bg-sand-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => beginEdit(bond, info.price)}
                  className="text-sm font-medium text-gold-700 underline-offset-2 hover:underline"
                >
                  {info.source === 'user' ? 'Update price' : 'Record a price'}
                </button>
                {info.source === 'user' && (
                  <button
                    onClick={() => removePrice(bond.isin)}
                    className="inline-flex items-center gap-1 text-sm text-ink-faint hover:text-red-700"
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
    </div>
  );
}
