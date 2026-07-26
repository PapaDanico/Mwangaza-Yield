'use client';

import { RotateCcw, X } from 'lucide-react';
import type { Bond } from '@/types/bond';

/**
 * Choose the bonds in a plan, rather than accepting the ones we picked.
 *
 * Extracted from the ladder so the goal planner uses the same control: three
 * copies of a bond picker would drift into three slightly different ideas of
 * what "remove the last rung" does, and the reader would have to relearn the
 * page they were already on.
 *
 * SELECTION IS ALL-OR-NOTHING, DELIBERATELY
 * -----------------------------------------
 * `chosen` empty means "let the tool pick". The first edit promotes the WHOLE
 * current selection to an explicit one — never a diff against the automatic
 * pick — because an override stored as "swap slot 2" silently re-resolves when
 * the capital or horizon moves the auto-pick underneath it, and the plan would
 * rearrange itself around a choice the reader thought they had fixed.
 *
 * A native `<select>`: the bond universe is long, and the platform control
 * already gives type-to-find, keyboard navigation and a proper picker on a
 * phone. Rebuilding that badly is the usual cost of a prettier one.
 */
export default function BondPicker({
  /** Every bond the reader could still buy, soonest maturity first. */
  selectable,
  /** The bonds the plan is currently built on, in plan order. */
  current,
  /** The explicit selection, or empty when the tool is choosing. */
  chosen,
  onChange,
  /** What one row is called here — "rung" on the ladder, "holding" elsewhere. */
  slotLabel = 'holding',
  className,
}: {
  selectable: Bond[];
  current: Bond[];
  chosen: string[];
  onChange: (next: string[]) => void;
  slotLabel?: string;
  className?: string;
}) {
  const tailored = chosen.length > 0;
  /** Edits always start from what is on screen, not from the stored selection. */
  const base = () => (tailored ? chosen : current.map((b) => b.isin));

  const swap = (index: number, isin: string) => {
    const next = [...base()];
    next[index] = isin;
    onChange(next);
  };
  const drop = (index: number) => onChange(base().filter((_, i) => i !== index));
  const add = (isin: string) => onChange([...base(), isin]);

  if (!current.length) return null;

  return (
    <div className={className}>
      {tailored && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-sand-100 px-3 py-2.5 text-xs text-ink-soft">
          <span>
            This is <strong>your</strong> selection — {current.length} bond
            {current.length === 1 ? '' : 's'} you chose, not the ones we would pick.
          </span>
          <button
            onClick={() => onChange([])}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-sand-300 px-2.5 py-1.5 font-medium text-ink transition-colors hover:bg-sand-200"
          >
            <RotateCcw size={13} /> Back to our picks
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {current.map((bond, i) => (
          <li key={bond.isin} className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`pick-${slotLabel}-${i}`}>
              Bond for {slotLabel} {i + 1}
            </label>
            <select
              id={`pick-${slotLabel}-${i}`}
              value={bond.isin}
              onChange={(e) => swap(i, e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-sand-300 bg-white px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-gold-600"
            >
              {selectable.map((b) => (
                <option key={b.isin} value={b.isin}>
                  {b.issueCode} · {b.maturityDate.slice(0, 4)}
                  {b.taxExempt ? ' · tax-free' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => drop(i)}
              aria-label={`Remove ${bond.issueCode}`}
              title={`Remove this ${slotLabel}`}
              className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-200 hover:text-ink"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <label htmlFor={`add-${slotLabel}`} className="font-medium">
          Add a bond:
        </label>
        <select
          id={`add-${slotLabel}`}
          value=""
          onChange={(e) => {
            if (e.target.value) add(e.target.value);
          }}
          className="min-w-0 max-w-[14rem] flex-1 rounded-lg border border-sand-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold-600"
        >
          <option value="">Choose a bond…</option>
          {selectable
            .filter((b) => !current.some((c) => c.isin === b.isin))
            .map((b) => (
              <option key={b.isin} value={b.isin}>
                {b.issueCode} · matures {b.maturityDate}
                {b.taxExempt ? ' · tax-free' : ''}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
