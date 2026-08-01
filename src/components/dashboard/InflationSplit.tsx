'use client';

/**
 * The headline inflation figure, and who it is wrong for.
 *
 * Every real yield in this app deflates by the headline CPI, which assumes the
 * reader's shopping resembles the national basket. For a household spending
 * most of its money on food and transport it does not, and July 2026 is a
 * clean illustration: 6.5% headline, 3.2% core, 15.0% non-core.
 *
 * This is not a second inflation number competing with the macro panel's. It
 * is the SPREAD, which is a different fact, and the panel deliberately does not
 * carry it — see the note in MacroPanel.
 */

import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { inflationSplit, whoFeelsWhat } from '@/lib/inflation-split';

export default function InflationSplitCard() {
  const macro = useBondStore((s) => s.macro);
  const split = useMemo(() => inflationSplit(macro), [macro]);

  // Null is a real answer: without both legs the comparison cannot be made,
  // and half of it would read as reassurance.
  if (!split) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">
          Whose inflation is {split.headline.toFixed(1)}%?
        </h2>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-sand-50 p-3">
          <p className="text-[11px] text-ink-faint">Everything else</p>
          <p className="num mt-0.5 text-xl font-bold text-mint-700">
            {split.core.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-ink-muted">%</span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">rent, school fees, clothing</p>
        </div>
        <div className="rounded-xl bg-sand-50 p-3">
          <p className="text-[11px] text-ink-faint">Food, fuel &amp; energy</p>
          <p className="num mt-0.5 text-xl font-bold text-red-600">
            {split.nonCore.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-ink-muted">%</span>
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">about a fifth of the basket</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-soft">{whoFeelsWhat(split)}</p>

      {/* The consequence for this app's own numbers, stated rather than left
        * for the reader to infer. Every real yield here uses the headline. */}
      <p className="mt-2 text-xs text-ink-faint">
        Every &ldquo;after inflation&rdquo; figure in this app uses the {split.headline.toFixed(1)}%
        headline. If your own costs run closer to the {split.nonCore.toFixed(1)}% side, your real
        return on any of this paper is worse than shown — which is the honest caveat on all of it.
      </p>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {split.source} · {split.date}
      </p>
    </div>
  );
}
