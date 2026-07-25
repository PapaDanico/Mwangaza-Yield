'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { PriceCoverage, ResolvedPrice } from '@/lib/prices';

/**
 * A price's pedigree, stated wherever the price is shown.
 *
 * The old behaviour was to render `100.00` in the same typeface as a real
 * quote. Nothing on screen distinguished a market price from the absence of
 * one, so a plan built entirely on par read exactly like a plan built on
 * traded prices. This badge exists so that can never happen again.
 */
export function PriceBadge({ info, className }: { info: ResolvedPrice; className?: string }) {
  const tone =
    info.source === 'par'
      ? 'bg-sand-200 text-ink-muted'
      : info.stale
        ? 'bg-gold-100 text-gold-800'
        : 'bg-emerald-100 text-emerald-800';

  const label =
    info.source === 'par' ? 'par placeholder' : info.source === 'user' ? 'your price' : 'last traded';

  const title =
    info.source === 'par'
      ? 'No price available for this bond — 100 is a placeholder, not the market.'
      : `${info.asOfDate}${info.ageDays !== null ? ` · ${info.ageDays} days ago` : ''}${info.note ? ` · ${info.note}` : ''}`;

  return (
    <span
      title={title}
      className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide', tone, className)}
    >
      {label}
      {info.stale && ' · check'}
    </span>
  );
}

/**
 * The whole-plan version. Sits above a set of figures and answers the only
 * question that matters before reading them: are these real?
 */
export function CoverageNotice({ coverage }: { coverage: PriceCoverage }) {
  if (coverage.total === 0) return null;

  if (coverage.parFallback === 0) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[12px] leading-relaxed text-emerald-900">
        Every bond below is priced from{' '}
        {coverage.staleCount > 0 ? 'prices you recorded — some are over a month old' : 'a real price'}.
        {coverage.staleCount > 0 && (
          <>
            {' '}
            <Link href="/prices/" className="underline underline-offset-2">
              Review them
            </Link>
            .
          </>
        )}
      </p>
    );
  }

  return (
    <p className="rounded-xl bg-sand-200/70 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
      <span className="font-semibold">{coverage.parFallback}</span> of {coverage.total} bonds below are
      priced at <span className="num">100</span> because we have no price for them — that is a
      placeholder, not the market, and it flatters the yields shown. The NSE licenses its prices and
      does not permit us to republish them, but you may look them up for your own use and{' '}
      <Link href="/prices/" className="font-medium text-gold-700 underline underline-offset-2">
        record them here
      </Link>
      . They stay on your device.
    </p>
  );
}
