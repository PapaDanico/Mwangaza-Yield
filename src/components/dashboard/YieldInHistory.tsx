'use client';

/**
 * "Is this high or low?" — the question the dashboard never answered.
 *
 * Every number on this page says what Kenya pays today. None of them said
 * whether today is a good day, and a saver deciding whether to lock money away
 * for twenty years cannot use a level without a scale. This puts each tenor
 * against its own auction history.
 *
 * It is deliberately separate from RateCycle, which owns the POLICY rate. This
 * one is about what long paper actually clears at, and the gap between the two
 * is currently the most interesting thing on the dashboard: the CBR has been
 * cut hard while the twenty-year sits near the top of its own range.
 *
 * WHY EVERY NUMBER HERE DRAGS ITS SAMPLE SIZE ALONG
 *
 * A percentile from 66 auctions and one from 6 read identically and mean
 * completely different things. `analogueStrength` grades them and the weak
 * ones say so in the sentence rather than in a footnote, because a reader who
 * skims footnotes is exactly the reader who will act on a thin number.
 */

import { useMemo } from 'react';
import { History } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { yieldContext, analogueStrength } from '@/lib/regime';
import Reserve from '@/components/shared/Reserve';

const TENORS = [
  { years: 10, label: '10-year' },
  { years: 20, label: '20-year' },
];

/** Today, as the data sees it — the newest auction we hold. */
function asOfFrom(dates: (string | null | undefined)[]): string {
  const real = dates.filter((d): d is string => typeof d === 'string' && d.length > 0).sort();
  return real[real.length - 1] ?? new Date().toISOString().slice(0, 10);
}

export default function YieldInHistory() {
  const bonds = useBondStore((s) => s.bonds);
  const prints = useBondStore((s) => s.auctionResults);
  const loaded = useBondStore((s) => s.loaded);

  const rows = useMemo(() => {
    if (!bonds.length || !prints.length) return [];
    const asOf = asOfFrom(prints.map((p) => p.auctionDate));
    return TENORS.map((t) => ({
      ...t,
      ctx: yieldContext(prints, bonds, t.years, asOf),
    })).filter((r) => r.ctx !== null);
  }, [bonds, prints]);

  if (!loaded) return <Reserve height={160} />;
  if (!rows.length) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <History size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">Is this high or low?</h2>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Today&apos;s auction rates against every past auction of similar length we hold.
      </p>

      <ul className="mt-3 space-y-3">
        {rows.map(({ years, label, ctx }) => {
          const c = ctx!;
          const pct = Math.round(c.percentile * 100);
          const strength = analogueStrength(c.observations);
          return (
            <li key={years} className="rounded-xl bg-sand-50 p-3">
              <p className="text-sm text-ink">
                <span className="font-semibold">{label}</span> last cleared at{' '}
                <span className="num font-semibold">{c.latestRate.toFixed(2)}%</span>{' '}
                <span className="text-ink-faint">({c.latestDate})</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {/* Plain words first. "73rd percentile" is precise and means
                  * nothing to most readers; "higher than 73 out of every 100"
                  * is the same fact in a form somebody can act on. */}
                That is higher than <span className="num font-semibold">{pct}</span> out of every
                100 past auctions at this length
                {strength === 'weak' && (
                  <> — though only <span className="num">{c.observations}</span> auctions, which
                  is too few to lean on</>
                )}
                {strength !== 'weak' && (
                  <> (<span className="num">{c.observations}</span> auctions)</>
                )}
                .
                {c.lastSeenAt && (
                  <>
                    {' '}The last time it paid about this much, before the past year, was{' '}
                    <span className="num">{c.lastSeenAt}</span>.
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-ink-faint">
        History is not a forecast. Kenya has been through roughly two full rate cycles in this
        record, so &ldquo;high against the past&rdquo; is context for a decision, not a reason to
        expect a particular next move.
      </p>
    </div>
  );
}
