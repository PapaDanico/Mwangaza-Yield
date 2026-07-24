'use client';

import Link from 'next/link';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { computeBondInvestment, formatPct } from '@/lib/financial-engine';
import type { Bond } from '@/types/bond';

interface Ranked {
  bond: Bond;
  netYTM: number;
  price: number;
}

export default function TopYields() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  if (!bonds.length) return null;

  const ranked: Ranked[] = bonds.map((bond) => {
    const price = secondary.find((t) => t.isin === bond.isin)?.price ?? 100;
    return { bond, price, netYTM: computeBondInvestment(bond, 100_000, price).netYTM };
  });
  const best = (pool: Ranked[]) => pool.sort((a, b) => b.netYTM - a.netYTM)[0];
  const bestIFB = best(ranked.filter((r) => r.bond.taxExempt));
  const bestFXD = best(ranked.filter((r) => !r.bond.taxExempt));

  const tiles = [
    bestIFB && { ...bestIFB, label: 'Best tax-free (IFB)', Icon: ShieldCheck, accent: 'text-mint-700' },
    bestFXD && { ...bestFXD, label: 'Best taxable (FXD)', Icon: Sparkles, accent: 'text-gold-700' },
  ].filter(Boolean) as (Ranked & { label: string; Icon: typeof Sparkles; accent: string })[];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiles.map(({ bond, netYTM, price, label, Icon, accent }) => (
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
            {bond.couponRate}% coupon · at {price.toFixed(2)} · {bond.maturityDate.slice(0, 4)} maturity
          </p>
        </Link>
      ))}
    </div>
  );
}
