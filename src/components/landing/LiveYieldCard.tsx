'use client';

import { ShieldCheck, TrendingUp } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { computeBondInvestment, formatPct } from '@/lib/financial-engine';
import { makePriceResolver } from '@/lib/prices';

/**
 * THE FIRST FIGURE ON THE SITE, AND IT WAS THE ONE WITHOUT PROVENANCE.
 *
 * This card priced every bond with a bare `secondary.find(...)?.price ?? 100`
 * and captioned the winner "Best net yield TODAY", in the largest type on the
 * landing page.
 *
 * `secondary.json` is empty — this project publishes no market prices at all,
 * by design, because exchange price data is licensed and we take none of it.
 * So that fallback fired for every bond, for every first-time visitor, and the
 * headline number was a yield at par: roughly the coupon, and not a rate
 * anybody could go and get.
 *
 * lib/prices.ts exists precisely to stop this. Its opening comment says each
 * planner "used to fall back silently to par 100... the reader had no way to
 * tell a real price from a placeholder", and it returns a `source` of 'user',
 * 'market' or 'par' so the PROVENANCE travels with the value. The dashboard
 * hero was given the same treatment for staleness (tests/unit/dashboard-hero).
 *
 * This component was written past all of it. The machinery was there; this
 * card just didn't call it. That is the more useful version of the finding —
 * not "a caveat is missing" but "the one abstraction built to prevent this was
 * bypassed by the most prominent caller".
 */
export default function LiveYieldCard() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);

  const priceFor = makePriceResolver(secondary);

  const best = bonds
    .map((bond) => {
      const resolved = priceFor(bond);
      return {
        bond,
        resolved,
        netYTM: computeBondInvestment(bond, 100_000, resolved.price).netYTM,
      };
    })
    .sort((a, b) => b.netYTM - a.netYTM)[0];

  if (!best) return null;

  const atPar = best.resolved.source === 'par';

  return (
    <div className="card w-64 rotate-2 border-gold-500/60 shadow-card transition hover:rotate-0">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {best.bond.taxExempt ? <ShieldCheck size={13} className="text-mint-700" /> : <TrendingUp size={13} className="text-gold-700" />}
        {atPar ? 'Best net yield at par' : 'Best net yield today'}
      </div>
      <p className="num mt-1.5 text-3xl font-bold text-gold-700">{formatPct(best.netYTM, 2)}</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {best.bond.issueCode}{best.bond.taxExempt ? ' · tax-free' : ' · after tax'}
      </p>
      {atPar && (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
          Priced at par 100 — a placeholder, not the market. Enter the price you are quoted in the{' '}
          <a href="/calculator/" className="underline">
            calculator
          </a>
          .
        </p>
      )}
    </div>
  );
}
