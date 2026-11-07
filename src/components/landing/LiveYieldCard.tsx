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

  /* THE ONE DARK SURFACE ON THE PAGE.
   *
   * A navy certificate on sand: the headline figure is the first thing a reader
   * of this site wants, so it gets the page's only dark, raised surface and the
   * largest type in the mono face. It replaced a card tilted 2deg over a logo
   * tile — a gimmick that put the logo (already in the header) at the centre of
   * the hero and a placeholder yield at its edge.
   *
   * The watermark is the brand mark's own idea, a sail over a curve rising to a
   * marked point, drawn large and faint. It is decoration (aria-hidden) and
   * carries no information. Everything the card SAYS — the provenance caption,
   * the par disclosure — is unchanged and still pinned by
   * tests/unit/par-placeholder-disclosed.test.ts. */
  return (
    <div className="relative w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-treasury-navy p-7 text-sand-100 shadow-ticket ring-1 ring-inset ring-white/10 md:p-8">
      <svg
        aria-hidden="true"
        viewBox="0 0 512 512"
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 text-gold-500 opacity-[0.08]"
      >
        <g fill="currentColor">
          <path d="M 317 111 C 329 164, 327 236, 299 319 C 266 303, 218 295, 182 313 C 248 288, 296 196, 317 111 Z" />
          <path d="M 112 333 L 192 310 L 194 322 Z" />
          <circle cx="362" cy="332" r="23" />
        </g>
        <path d="M 152 340 Q 258 414, 358 336" fill="none" stroke="currentColor" strokeWidth="21" strokeLinecap="round" />
      </svg>
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-medium text-gold-300">
          {best.bond.taxExempt ? <ShieldCheck size={15} className="text-mint-300" /> : <TrendingUp size={15} />}
          {atPar ? 'Best net yield at par' : 'Best net yield today'}
        </div>
        <p className="num mt-5 text-6xl font-semibold leading-none tracking-tight text-gold-400 md:text-7xl">
          {formatPct(best.netYTM, 2)}
        </p>
        <p className="mt-3 text-sm text-sand-300">
          <span className="num">{best.bond.issueCode}</span>
          {best.bond.taxExempt ? ' · tax-free' : ' · after tax'}
        </p>
        {atPar && (
          <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-sand-300/85">
            Priced at par 100 — a placeholder, not the market. Enter the price you are quoted in the{' '}
            <a href="/calculator/" className="font-medium text-gold-300 underline underline-offset-2 hover:text-gold-100">
              calculator
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
