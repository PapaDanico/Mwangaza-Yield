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
import { inflationSplit, moversFor, whoFeelsWhat, type MoversFile } from '@/lib/inflation-split';
import MOVERS from '../../../public/data/inflation-movers.json';

export default function InflationSplitCard() {
  const macro = useBondStore((s) => s.macro);
  const split = useMemo(() => inflationSplit(macro), [macro]);
  const movers = useMemo(() => (split ? moversFor(split, MOVERS as MoversFile) : null), [split]);

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
          <p className="text-xs text-ink-faint">Core basket</p>
          <p className="num mt-0.5 text-xl font-bold text-mint-700">
            {split.core.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-ink-muted">%</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">rent, fees, milk, fares, flour</p>
        </div>
        <div className="rounded-xl bg-sand-50 p-3">
          <p className="text-xs text-ink-faint">Non-core basket</p>
          <p className="num mt-0.5 text-xl font-bold text-red-600">
            {split.nonCore.toFixed(1)}
            <span className="ml-0.5 text-xs font-normal text-ink-muted">%</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">fresh produce, fuel, power; 19% of the CPI</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-soft">{whoFeelsWhat(split)}</p>

      {/* What sits behind the two numbers. Core is not "calm": it holds fares,
        * milk and beef that are rising in double digits, which the 4% average
        * hides. */}
      {movers && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-ink">Price changes CBK printed, year on year</p>
          <ul className="mt-1.5 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {movers.map((m) => (
              <li key={m.item} className="flex items-baseline justify-between gap-2 border-t border-sand-200 py-1 text-xs">
                <span className="text-ink-soft">{m.item}</span>
                <span className={`num font-semibold ${m.changePct < 0 ? 'text-mint-700' : 'text-ink'}`}>
                  {m.changePct > 0 ? '+' : '\u2212'}
                  {Math.abs(m.changePct).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The consequence for this app's own numbers, stated rather than left
        * for the reader to infer. Every real yield here uses the headline. */}
      <p className="mt-2 text-xs text-ink-faint">
        Every &ldquo;after inflation&rdquo; figure in this app uses the {split.headline.toFixed(1)}%
        headline. If your own costs run closer to the {split.nonCore.toFixed(1)}% side, your real
        return on any of this paper is worse than shown — which is the honest caveat on all of it.
      </p>
      <p className="mt-1.5 text-xs text-ink-faint">
        {split.source} · {split.date}
      </p>
    </div>
  );
}
