'use client';

import { ShieldCheck, TrendingUp } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { computeBondInvestment, formatPct } from '@/lib/financial-engine';

export default function LiveYieldCard() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);

  const best = bonds
    .map((bond) => {
      const price = secondary.find((t) => t.isin === bond.isin)?.price ?? 100;
      return { bond, netYTM: computeBondInvestment(bond, 100_000, price).netYTM };
    })
    .sort((a, b) => b.netYTM - a.netYTM)[0];

  if (!best) return null;

  return (
    <div className="card w-64 rotate-2 border-gold-500/60 shadow-card transition hover:rotate-0">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {best.bond.taxExempt ? <ShieldCheck size={13} className="text-mint-700" /> : <TrendingUp size={13} className="text-gold-700" />}
        Best net yield today
      </div>
      <p className="num mt-1.5 text-3xl font-bold text-gold-700">{formatPct(best.netYTM, 2)}</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {best.bond.issueCode}{best.bond.taxExempt ? ' · tax-free' : ' · after tax'}
      </p>
    </div>
  );
}
