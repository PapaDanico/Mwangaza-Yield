'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { cn } from '@/lib/utils';
import Reserve from '@/components/shared/Reserve';
import {
  SOVEREIGN_RATINGS,
  RATING_SOURCE,
  BAND_MEANING,
} from '@/data/sovereign-rating';

const SENTIMENT: Record<string, { dot: string; label: string }> = {
  good: { dot: 'bg-mint-600', label: 'Supportive' },
  caution: { dot: 'bg-gold-500', label: 'Watch' },
  watch: { dot: 'bg-slate-500', label: 'Neutral' },
};

/**
 * Answers the question behind every bond purchase: is the borrower good for
 * the money? Each indicator carries a plain-language note on what it means
 * for a lender, not just the number.
 */
export default function SovereignContext() {
  const context = useBondStore((s) => s.context);
  const [open, setOpen] = useState<string | null>(null);
  if (!context.length) return <Reserve height={180} />;

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="font-semibold text-ink">Can the borrower pay?</h2>
        <p className="text-xs text-ink-faint">
          You are lending to the Kenyan government. Here is how it is doing.
        </p>
      </div>

      {/* The agencies' answer, before our ratios.

          The indicators below are inputs to a credit judgement; this IS
          the credit judgement, made by people paid to make it. Putting it
          second would have the reader assemble a verdict from ratios while the
          published verdict sat underneath. It also guards against the way the
          ratios read in aggregate: several carry a green "Supportive" dot on
          generous thresholds, and a reader could otherwise leave thinking a
          single-B sovereign is the risk-free asset the textbooks describe. */}
      <div className="mb-4 rounded-xl border border-sand-300 bg-sand-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-medium text-ink-muted">Credit rating</span>
          <span className="text-[11px] text-ink-faint">
            {RATING_SOURCE.publisher} · {RATING_SOURCE.title}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {SOVEREIGN_RATINGS.map((r) => (
            <div key={r.agency} className="min-w-0">
              <div className="truncate text-[11px] text-ink-muted">{r.agency}</div>
              <div className="num text-lg font-bold text-ink">
                {r.rating}
                <span className="ml-1.5 text-[11px] font-normal text-ink-muted">{r.outlook}</span>
              </div>
              {/* The previous rating is the only part a reader can act on: a
                  B3 that came up from Caa1 and a B3 on the way down are the
                  same letter and opposite news. */}
              <div className="text-[11px] text-ink-faint">
                since {r.since}
                {r.previous && r.previous.rating !== r.rating && (
                  <> · was {r.previous.rating}</>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 border-t border-sand-300 pt-2 text-xs leading-relaxed text-ink-soft">
          {BAND_MEANING}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {context.map((c) => {
          const s = SENTIMENT[c.sentiment] ?? SENTIMENT.watch;
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rounded-xl border border-sand-300 bg-sand-50">
              <button
                onClick={() => setOpen(isOpen ? null : c.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} title={s.label} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-ink-muted">{c.label}</span>
                  <span className="num text-lg font-bold text-ink">
                    {c.value}
                    <span className="ml-1 text-xs font-normal text-ink-muted">{c.unit}</span>
                    {/* The year belongs on the face of the card, not behind a tap.
                        These are annual national statistics compiled from country
                        submissions, so a figure here is routinely a year or two
                        old — "Reserves 4.03 months" with no date reads as today's
                        position. Someone weighing whether to lend to this borrower
                        should see the vintage without having to go looking. */}
                    {c.asOf && (
                      <span className="ml-1.5 text-[11px] font-normal text-ink-faint">
                        ({c.asOf})
                      </span>
                    )}
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className={cn('shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-180')}
                />
              </button>
              {isOpen && (
                <div className="border-t border-sand-300 p-3 pt-2.5">
                  <p className="text-xs leading-relaxed text-ink-soft">{c.note}</p>
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold-700 hover:underline"
                  >
                    {c.source} · {c.asOf} <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
