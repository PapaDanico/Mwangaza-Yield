'use client';

import Link from 'next/link';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { makePriceResolver } from '@/lib/prices';
import { computeBondInvestment, formatPct } from '@/lib/financial-engine';
import ratesFeed from '../../../public/data/rates.json';
import type { Bond } from '@/types/bond';

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

export default function TopYields() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const userPrices = usePriceStore((s) => s.userPrices);
  if (!bonds.length) return null;

  // Ranked from the price book like everywhere else. Left on the old par-only
  // fallback, the dashboard would name a "best yield" the calculator and ladder
  // disagreed with the moment a reader recorded a price — and this tile is the
  // first number anyone sees.
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

  const benchmark = currentBenchmark();

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map(({ bond, netYTM, price, isPar, label, Icon, accent }) => (
          <Link
            key={bond.isin}
            href="/calculator/"
            className="card group relative overflow-hidden transition hover:border-gold-500"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              <Icon size={14} className={accent} /> {label}
            </div>
            <p className={`num mt-2 text-4xl font-bold ${accent}`}>{formatPct(netYTM, 2)}</p>
            <p className="mt-1 text-sm text-ink-soft">
              net of tax · <span className="font-semibold text-ink">{bond.issueCode}</span>
            </p>
            <p className="text-xs text-ink-faint">
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
          </Link>
        ))}
      </div>

      {benchmark && (
        <p className="px-1 text-xs leading-relaxed text-ink-muted">
          Those are yields <strong>at the price shown</strong>, not offers. The most recent
          primary auction cleared at{' '}
          <Link href="/auctions/" className="font-semibold text-ink underline-offset-2 hover:underline">
            <span className="num">{benchmark.rate.toFixed(2)}%</span>
          </Link>{' '}
          gross ({benchmark.asOf}) — what the market is paying now, as against what these bonds
          pay on money at face value.
        </p>
      )}
    </div>
  );
}
