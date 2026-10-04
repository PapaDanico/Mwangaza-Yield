'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { makePriceResolver } from '@/lib/prices';
import { computeBondInvestment, formatPct } from '@/lib/financial-engine';
import Reserve from '@/components/shared/Reserve';
import ratesFeed from '../../../public/data/rates.json';
import type { Bond } from '@/types/bond';
import dynamic from 'next/dynamic';

/* Loaded on demand. BondDetailCard draws its history with Recharts, and a
 * static import put the whole charting library (349 KB minified) into the
 * dashboard's first load for a dialog nobody has opened yet. */
const BondDetailCard = dynamic(() => import('@/components/BondDetailCard'), { ssr: false });

interface Ranked {
  bond: Bond;
  netYTM: number;
  price: number;
  /** Whether the price is a reader's own or the declared par placeholder. */
  isPar: boolean;
}

/**
 * The most recent thing the primary market actually cleared at.
 *
 * The tiles below rank bonds by net yield AT A STATED PRICE, which for most
 * bonds is par, because we publish no market prices. That is a real and useful
 * figure — it is what the coupon pays on money at face value — and it is NOT a
 * rate anybody can go and get today. The gap is not small: the tile that leads
 * this dashboard is a bond last auctioned in February 2024, at the top of the
 * rate cycle, while long paper now clears near 13.6%.
 *
 * Under a headline reading "what Kenya is paying savers TODAY", that needed
 * saying. So the current auction benchmark sits beside the tiles, from the same
 * feed the app publishes to other products, and each tile carries the date its
 * own figure belongs to.
 */
function currentBenchmark(): { rate: number; asOf: string } | null {
  const bands = (ratesFeed as { bondAuctionBenchmarks?: { bands?: {
    medianClearingRate: number | null; latestAuctionDate: string | null;
  }[] } }).bondAuctionBenchmarks?.bands ?? [];
  const quotable = bands.filter(
    (b): b is { medianClearingRate: number; latestAuctionDate: string } =>
      b.medianClearingRate !== null && b.latestAuctionDate !== null
  );
  if (!quotable.length) return null;
  // The most recently auctioned band, not the highest — a benchmark should be
  // the freshest reading, never the flattering one.
  const newest = quotable.reduce((a, b) => (b.latestAuctionDate > a.latestAuctionDate ? b : a));
  return { rate: newest.medianClearingRate, asOf: newest.latestAuctionDate };
}

const BENCHMARK = currentBenchmark();

function BenchmarkNote() {
  if (!BENCHMARK) return null;
  return (
    <p className="px-1 text-xs leading-relaxed text-ink-muted">
      Those are yields <strong>at the price shown</strong>, not offers. The most recent
      primary auction cleared at{' '}
      <Link href="/auctions/" className="font-semibold text-ink underline-offset-2 hover:underline">
        <span className="num">{BENCHMARK.rate.toFixed(2)}%</span>
      </Link>{' '}
      gross ({BENCHMARK.asOf}) — what the market is paying now, as against what these bonds
      pay on money at face value.
    </p>
  );
}

export default function TopYields() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const prints = useBondStore((s) => s.auctionResults);
  const userPrices = usePriceStore((s) => s.userPrices);
  const [selected, setSelected] = useState<Bond | null>(null);
  // Holds the space rather than popping in. See Reserve for the measurement.
  /* Measured on the built page at 390px and 1280px, not estimated.
  *
  * Reserve's contract is "roughly what the real card occupies, so the swap
  * does not shift either way", and every one of these was quoted from an
  * earlier layout and had drifted badly — this one by 152px on a phone.
  * A reservation that is too SHORT is the ordinary case here and the page
  * grows under the reader as each card lands.
  *
  * Two numbers because one cannot be right at both ends: the height prop
  * carries the desktop figure and the min-h carries the phone's, so neither
  * breakpoint swaps into a different height. */
  /* The note below the tiles reads only the static rates feed, so it renders
   * during prerender rather than after the bond store loads. It was the page's
   * largest-contentful-paint element on a phone and, gated behind the store,
   * painted at 8.3s under Lighthouse's mobile throttle. The reservation now
   * covers the tiles alone. */

  // Ranked from the price book like everywhere else. Left on the old par-only
  // fallback, the dashboard would name a "best yield" the calculator and ladder
  // disagreed with the moment a reader recorded a price — and this tile is the
  // first number anyone sees.
  const loading = !bonds.length;
  const priceInfoOf = makePriceResolver(secondary, userPrices);
  const ranked: Ranked[] = bonds.map((bond) => {
    const { price, source } = priceInfoOf(bond);
    return {
      bond,
      price,
      isPar: source === 'par',
      netYTM: computeBondInvestment(bond, 100_000, price).netYTM,
    };
  });
  const best = (pool: Ranked[]) => pool.sort((a, b) => b.netYTM - a.netYTM)[0];
  const bestIFB = best(ranked.filter((r) => r.bond.taxExempt));
  const bestFXD = best(ranked.filter((r) => !r.bond.taxExempt));

  const tiles = [
    bestIFB && { ...bestIFB, label: 'Best tax-free (IFB)', Icon: ShieldCheck, accent: 'text-mint-700' },
    bestFXD && { ...bestFXD, label: 'Best taxable (FXD)', Icon: Sparkles, accent: 'text-gold-700' },
  ].filter(Boolean) as (Ranked & { label: string; Icon: typeof Sparkles; accent: string })[];

  return (
    <div className="space-y-2">
      {/* Says what these are before the reader sees the numbers: since 4 Oct
          they follow the latest auctions on the dashboard rather than lead it. */}
      <h2 className="font-display text-sm font-semibold text-ink">
        Highest-yielding bonds on the list{' '}
        <span className="font-normal text-ink-muted">— at the last price CBK published for each</span>
      </h2>
      {/* Two columns from the smallest screen. Stacked, these two tiles cost
          about 500px — most of a phone viewport — to deliver two numbers, and
          the reader had to scroll before learning anything else existed. Side
          by side they are also the comparison they were always meant to be:
          tax-free against taxable, at a glance. */}
      {/* The same tree in both states: swapping the whole component for a
          placeholder remounted the note below, and a remounted node is a new
          largest-contentful-paint candidate — so it registered at hydration
          time even though its text was in the prerendered HTML. */}
      {loading ? (
        <Reserve height={170} className="min-h-[262px] sm:min-h-[170px]" />
      ) : (
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {tiles.map(({ bond, netYTM, price, isPar, label, Icon, accent }) => (
          <div
            key={bond.isin}
            className="card group relative overflow-hidden p-3 transition hover:border-gold-500 sm:p-4"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint sm:gap-2 sm:text-xs">
              <Icon size={13} className={`shrink-0 ${accent}`} /> {label}
            </div>
            <p className={`num mt-1.5 text-3xl font-bold sm:mt-2 sm:text-4xl ${accent}`}>
              {formatPct(netYTM, 2)}
            </p>
            <p className="mt-1 text-xs text-ink-soft sm:text-sm">
              net of tax · <span className="font-semibold text-ink">{bond.issueCode}</span>
            </p>
            <p className="text-[11px] text-ink-faint sm:text-xs">
              {bond.couponRate}% coupon · at {price.toFixed(2)}
              {isPar && ' (par — no market price published)'} · {bond.maturityDate.slice(0, 4)} maturity
            </p>
            {/* The date the figure belongs to. A bond is auctioned when the
                government wants to borrow at that tenor, so "most recent" here
                ranges from days to years — and the reader cannot tell which
                from a percentage alone. */}
            {bond.ytmAsOf && (
              <p className="mt-1 text-[11px] text-ink-faint">
                Last auctioned {bond.ytmAsOf} at {bond.ytmGross?.toFixed(2)}% gross
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={() => setSelected(bond)} className="text-xs font-semibold text-gold-700 hover:underline">
                View details
              </button>
              <Link href="/calculator/" className="text-xs text-ink-muted hover:underline">
                Calculate
              </Link>
            </div>
          </div>
        ))}
      </div>
      )}

      <BenchmarkNote />
      {selected && (
      <BondDetailCard
        bond={selected}
        related={bonds.filter((b) => b.taxExempt === selected?.taxExempt && b.isin !== selected?.isin)}
        prints={prints}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
      )}
    </div>
  );
}
