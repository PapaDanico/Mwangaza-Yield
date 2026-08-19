'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trash2, Download, Users, ShieldCheck } from 'lucide-react';
import type { Bond } from '@/types/bond';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { useCommunityPriceStore, selectCommunityPrice } from '@/stores/communityPriceStore';
import { resolvePrice, MIN_PRICE, MAX_PRICE, isPlausiblePrice } from '@/lib/prices';
import {
  computeBondInvestment, formatKES, formatPct, isYieldPinned, YTM_CEILING,
} from '@/lib/financial-engine';
import { PRICE_SOURCES, computeFairValueSpread, type PriceSource } from '@/lib/communityPrice';
import DataState from '@/components/shared/DataState';
import { PriceBadge } from '@/components/shared/PriceProvenance';
import { benchmarkQuote } from '@/lib/quote-benchmark';
import { cn } from '@/lib/utils';
import { inputCls, labelCls } from '@/lib/field-styles';

// Government bonds: tighter plausibility range per requirement
const GOV_BOND_MIN = 80;
const GOV_BOND_MAX = 120;

function isGovBondPrice(value: number, bond: Bond): boolean {
  if (!['FXD', 'IFB'].includes(bond.category)) return isPlausiblePrice(value);
  return value >= GOV_BOND_MIN && value <= GOV_BOND_MAX;
}

function fairValueBadgeClass(color: 'red' | 'green' | 'gold') {
  if (color === 'red') return 'bg-red-100 text-red-800';
  if (color === 'gold') return 'bg-gold-100 text-gold-800';
  return 'bg-mint-500/15 text-mint-700';
}

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
  const communityState = useCommunityPriceStore();
  const contribute = useCommunityPriceStore((s) => s.contribute);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [observedOn, setObservedOn] = useState('');
  const [source, setSource] = useState<PriceSource>('Broker');
  const [error, setError] = useState('');
  const [contributeEnabled, setContributeEnabled] = useState(false);

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
  // guard the calculator uses.
  const pct = (v: number) => (isYieldPinned(v) ? `over ${YTM_CEILING}%` : formatPct(v));

  const SHORT_DATED_DAYS = 365;

  function beginEdit(bond: Bond, current: number) {
    setEditing(bond.isin);
    setDraft(current.toFixed(2));
    setObservedOn(todayISO);
    setSource('Broker');
    setError('');
  }

  async function save(bond: Bond) {
    const value = Number(draft);
    if (!isGovBondPrice(value, bond)) {
      const min = ['FXD', 'IFB'].includes(bond.category) ? GOV_BOND_MIN : MIN_PRICE;
      const max = ['FXD', 'IFB'].includes(bond.category) ? GOV_BOND_MAX : MAX_PRICE;
      setError(`A bond price is quoted per 100 face. Enter something between ${min} and ${max}.`);
      return;
    }
    if (!observedOn) {
      setError('Which day did you see this price? It decides whether we flag it as stale later.');
      return;
    }
    const ok = await setPrice({ isin: bond.isin, price: value, observedOn, note: source });
    if (!ok) {
      setError('Could not save — private browsing blocks local storage on some devices.');
      return;
    }
    if (contributeEnabled) {
      await contribute({ isin: bond.isin, price: value, observedOn, source });
    }
    setEditing(null);
    setError('');
  }

  function downloadMyPriceBook() {
    const lines = [
      'isin,issueCode,price,observedOn,source',
      ...userPrices.map((p) => {
        const bond = bonds.find((b) => b.isin === p.isin);
        return `${p.isin},${bond?.issueCode ?? ''},${p.price},${p.observedOn},${p.note ?? ''}`;
      }),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mwangaza-price-book.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCommunitySummary() {
    const lines = [
      'isin,issueCode,medianPrice,minPrice,maxPrice,submissionCount,lastUpdated',
    ];
    for (const bond of bonds) {
      const cp = selectCommunityPrice(communityState, bond.isin);
      if (cp) {
        lines.push(
          `${cp.isin},${bond.issueCode},${cp.median},${cp.min},${cp.max},${cp.count},${cp.lastUpdated}`,
        );
      }
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mwangaza-community-summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasCommunityData = bonds.some(
    (b) => selectCommunityPrice(communityState, b.isin) !== null,
  );

  if (!bonds.length) return <DataState />;

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

      {/* Privacy notice + opt-in toggle */}
      <div className="flex flex-col gap-3 rounded-xl border border-sand-300 bg-sand-50 px-4 py-3 sm:flex-row sm:items-start">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-mint-700" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] leading-relaxed text-ink-soft">
            <strong className="text-ink">
              Your prices are anonymized and stored only on your device. We never see them.
            </strong>{' '}
            When you enable &ldquo;Contribute to Community Book&rdquo;, an anonymized copy of each
            saved price is added to your local community book. Timestamps are stripped to day-level,
            prices rounded to the nearest 0.25, and privacy noise added when you have fewer than
            five entries for a bond. No individual price is ever displayed.
          </p>
        </div>
        {/* Opt-in toggle — default off */}
        <label className="flex shrink-0 cursor-pointer items-center gap-2 sm:ml-auto">
          <span className="text-[12px] font-medium text-ink-muted whitespace-nowrap">
            Contribute to Community Book
          </span>
          <button
            role="switch"
            aria-checked={contributeEnabled}
            aria-label="Contribute to Community Book"
            onClick={() => setContributeEnabled((v) => !v)}
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-1',
              contributeEnabled ? 'bg-gold-500' : 'bg-sand-400',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                contributeEnabled ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
        </label>
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-muted">
            <span className="num font-semibold text-ink">{priced}</span> of{' '}
            <span className="num">{bonds.length}</span> bonds priced
          </p>
          {userPrices.length > 0 && (
            <button
              onClick={downloadMyPriceBook}
              className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-2.5 py-1.5 text-xs text-ink-muted hover:border-ink-muted hover:text-ink"
            >
              <Download size={13} /> My Price Book
            </button>
          )}
          {hasCommunityData && (
            <button
              onClick={downloadCommunitySummary}
              className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-2.5 py-1.5 text-xs text-ink-muted hover:border-ink-muted hover:text-ink"
            >
              <Users size={13} /> Community Summary
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map(({ bond, info, netYTM, daysToMaturity }) => {
          const cp = selectCommunityPrice(communityState, bond.isin);

          return (
            <div key={bond.isin} className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{bond.issueCode}</p>
                  <p className="text-[12px] text-ink-faint">
                    matures {bond.maturityDate} · {bond.couponRate.toFixed(3)}% coupon
                    {bond.taxExempt && ' · tax-free'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {/* Fair Value badge — only when community data exists */}
                  {cp && info.source !== 'par' && (() => {
                    const spread = computeFairValueSpread(bond.isin, cp.median, info.price);
                    return (
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                          fairValueBadgeClass(spread.badgeColor),
                        )}
                        title={`Based on ${cp.count} community observations · last ${cp.lastUpdated}`}
                      >
                        {spread.badgeText}
                      </span>
                    );
                  })()}
                  <PriceBadge info={info} />
                  <span className="num text-sm font-semibold text-ink">{info.price.toFixed(2)}</span>
                  <span className="num text-sm text-gold-700">{pct(netYTM)} net</span>
                </div>
              </div>

              {/* Community stats — only show when ≥3 submissions exist */}
              {cp && (
                <div className="mt-2 rounded-lg border border-sand-200 bg-sand-100/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-ink-soft">
                    <span className="flex items-center gap-1">
                      <Users size={11} className="text-ink-faint" />
                      <strong className="text-ink">Median quoted price:</strong>{' '}
                      <span className="num font-semibold text-ink">{formatKES(cp.median, 2)}</span>
                    </span>
                    <span>
                      Range:{' '}
                      <span className="num">{formatKES(cp.min, 2)}</span>
                      {' \u2013 '}
                      <span className="num">{formatKES(cp.max, 2)}</span>
                    </span>
                    {info.source !== 'par' && (() => {
                      const spread = computeFairValueSpread(bond.isin, cp.median, info.price);
                      const label =
                        spread.verdict === 'at'
                          ? 'At theoretical'
                          : spread.verdict === 'above'
                            ? 'Above theoretical'
                            : 'Below theoretical';
                      return (
                        <span>
                          Fair value indicator:{' '}
                          <strong
                            className={
                              spread.verdict === 'above'
                                ? spread.spreadPct > 0.05 ? 'text-red-700' : 'text-gold-700'
                                : 'text-mint-700'
                            }
                          >
                            {label}
                          </strong>
                        </span>
                      );
                    })()}
                    <span className="text-[11px] text-ink-faint">
                      {cp.count} {cp.count === 1 ? 'observation' : 'observations'} · last {cp.lastUpdated}
                    </span>
                  </div>
                </div>
              )}

              { /*
                Is this a good price?
                Only for a price the reader actually recorded.
              */ }
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
                      <span className={labelCls}>Price per 100</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={['FXD', 'IFB'].includes(bond.category) ? GOV_BOND_MIN : MIN_PRICE}
                        max={['FXD', 'IFB'].includes(bond.category) ? GOV_BOND_MAX : MAX_PRICE}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className={inputCls}
                        autoFocus
                      />
                    </label>
                    <label className="block">
                      <span className={labelCls}>Date you saw it</span>
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
                    <span className={labelCls}>Source</span>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as PriceSource)}
                      className={inputCls}
                    >
                      {PRICE_SOURCES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  {error && <p className="text-[12px] font-medium text-red-700">{error}</p>}
                  {contributeEnabled && (
                    <p className="text-[11px] text-ink-faint">
                      An anonymized copy of this price will be added to your local community book.
                      Nothing leaves your device.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => save(bond)}
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
          );
        })}
        {!rows.length && (
          <p className="card text-sm text-ink-muted">No bond matches &ldquo;{query}&rdquo;.</p>
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
