'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, CalendarClock } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { weekChanges, type WeekChange } from '@/lib/week-changes';
import Reserve from '@/components/shared/Reserve';
import MPC_NEXT from '../../../public/data/mpc-next.json';

const HREF: Record<string, string> = { tbills: '/tbills/', bonds: '/auctions/', cpi: '/macro/' };

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

function Arrow({ d }: { d: WeekChange['direction'] }) {
  if (d === 'up') return <ArrowUpRight size={14} className="text-red-700" aria-hidden />;
  if (d === 'down') return <ArrowDownRight size={14} className="text-emerald-700" aria-hidden />;
  if (d === 'flat') return <Minus size={14} className="text-ink-faint" aria-hidden />;
  return null;
}

/**
 * The returning reader's first question: what moved since I last looked?
 * Every line is a real figure against a real previous one, with its date.
 * Arrow colours read from a BUYER's side of the rate for T-bills would be
 * ambiguous, so colour follows the number: up is red, down is green, and the
 * words carry the meaning.
 */
export default function WhatChanged() {
  const tbills = useBondStore((s) => s.tbills);
  const prints = useBondStore((s) => s.auctionResults);
  const cpi = useBondStore((s) => s.cpiHistory);
  const items = useMemo(() => weekChanges(tbills, prints, cpi), [tbills, prints, cpi]);

  const mpc = new Date(`${MPC_NEXT.date}T00:00:00`);
  const mpcDays = Math.ceil((mpc.getTime() - Date.now()) / 86_400_000);

  if (!tbills.length) return <Reserve height={199} className="min-h-[283px] sm:min-h-[199px]" />;

  return (
    <section className="card" aria-labelledby="what-changed">
      <h2 id="what-changed" className="text-xs font-semibold uppercase tracking-wider text-gold-700">
        What changed
      </h2>
      <ul className="mt-2 divide-y divide-sand-200">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
            <Link href={HREF[c.id] ?? '/'} className="font-medium text-ink underline-offset-2 hover:underline">
              {c.label}
            </Link>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="num text-ink">{c.value}</span>
              {c.change && (
                <span className="inline-flex items-center gap-0.5 text-xs text-ink-muted">
                  <Arrow d={c.direction} />
                  {c.change}
                </span>
              )}
              {c.id !== 'cpi' && <span className="text-[11px] text-ink-faint">· {fmt(c.asOf)}</span>}
            </span>
          </li>
        ))}
        {mpcDays >= 0 && (
          <li className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm">
            <Link href="/macro/" className="font-medium text-ink underline-offset-2 hover:underline">
              Next rate decision (MPC)
            </Link>
            <span className="inline-flex items-center gap-1.5 text-ink">
              <CalendarClock size={14} className="text-gold-700" aria-hidden />
              {fmt(MPC_NEXT.date)}
              <span className="text-[11px] text-ink-faint">· in {mpcDays} days</span>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
