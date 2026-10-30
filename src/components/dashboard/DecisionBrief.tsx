'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { decisionBrief, type BriefItem } from '@/lib/decision-brief';
import { inflationExpectations } from '@/lib/expectations';
import Reserve from '@/components/shared/Reserve';

const DOT: Record<BriefItem['tone'], string> = {
  good: 'bg-emerald-600',
  watch: 'bg-gold-600',
  neutral: 'bg-ink-faint',
};

/**
 * What the figures say to do, in sentences. The tables elsewhere on the page
 * give the numbers; this reads them for the saver. Every line is computed from
 * data already on the page (src/lib/decision-brief.ts) and drops out when an
 * input is missing, so it can be shorter than three lines but never wrong by
 * omission-as-zero.
 */
export default function DecisionBrief() {
  const tbills = useBondStore((s) => s.tbills);
  const macro = useBondStore((s) => s.macro);
  const bonds = useBondStore((s) => s.bonds);
  const prints = useBondStore((s) => s.auctionResults);

  const items = useMemo(() => {
    const oneYear = inflationExpectations().find((h) => h.horizonMonths === 12);
    return decisionBrief({ tbills, macro, bonds, prints, expectedInflation1y: oneYear?.midpoint ?? null });
  }, [tbills, macro, bonds, prints]);

  if (!tbills.length) return <Reserve height={454} className="min-h-[764px] sm:min-h-[454px]" />;
  if (!items.length) return null;

  return (
    <section className="card" aria-labelledby="decision-brief">
      <h2 id="decision-brief" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gold-700">
        <Compass size={14} aria-hidden /> What the figures say this week
      </h2>
      <ul className="mt-3 space-y-4">
        {items.map((i) => (
          <li key={i.id} className="flex gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[i.tone]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{i.headline}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{i.detail}</p>
              <Link href={i.href} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-700 underline-offset-2 hover:underline">
                {i.linkLabel} <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-ink-faint">
        Worked out from CBK&apos;s latest published figures. Education, not investment advice.
      </p>
    </section>
  );
}
