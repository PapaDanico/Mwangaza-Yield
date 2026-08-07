'use client';

import { useBondStore } from '@/stores/bondStore';
import Reserve from '@/components/shared/Reserve';
import { indicatorAge, indicatorStaleNote, vintageLabel } from '@/lib/indicator-freshness';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  CBR: 'Central Bank Rate',
  CPI: 'Inflation (CPI)',
  FX_USD_KES: 'USD/KES',
  GDP: 'GDP Growth',
};

/**
 * What a third of a phone screen can actually hold.
 *
 * Three cards across 390px leave ~110px each, and "Central Bank Rate"
 * truncated to "Central Bank…" — which reads as a different thing entirely,
 * and is the one label a reader is least likely to guess from context. An
 * abbreviation everyone in this market uses beats an amputated phrase.
 */
const SHORT_LABELS: Record<string, string> = {
  CBR: 'CBR',
  CPI: 'Inflation',
  FX_USD_KES: 'USD/KES',
  GDP: 'GDP',
};

/**
 * The three headline indicators, and only those.
 *
 * The core and non-core CPI splits live in macro.json beside the headline, but
 * they do not belong here: this is a three-across grid on a 390px screen, and
 * a fourth and fifth card would either overflow or shrink every label past
 * legibility. They are a comparison rather than a reading anyway — the point
 * is the GAP between them — so InflationSplit tells that story instead.
 */
const HEADLINE: string[] = ['CBR', 'CPI', 'FX_USD_KES', 'GDP'];

export default function MacroPanel() {
  const all = useBondStore((s) => s.macro);
  const macro = all.filter((m) => HEADLINE.includes(m.indicator));
  if (!macro.length) return <Reserve height={84} />;

  /* A FIGURE THAT HAS STOPPED MOVING MUST NOT LOOK LIKE ONE THAT HAS NOT.
   *
   * USD/KES sat at 2026-07-20 for eighteen days beside a CPI from yesterday,
   * and both rendered identically — same weight, same colour, on a page whose
   * whole promise is the latest available information. The card did print the
   * date, but behind `hidden sm:block`, so on a 390px phone the one number
   * that had rotted was the one shown with the least context.
   *
   * Each indicator is now judged against its own publisher's cadence — see
   * indicator-freshness.ts, whose budgets are held to healthcheck.py's by a
   * test — and a stale one says how old it is and how old it should get, so
   * the reader can judge it rather than decode a warning colour. */ 

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {macro.map((m) => {
        const age = indicatorAge(m.indicator, m.date);
        const note = indicatorStaleNote(age);
        return (
        <div
          key={m.id}
          className={cn('card p-3 sm:p-4', note && 'border-gold-600/50 bg-gold-500/[0.06]')}
        >
          <p className="truncate text-[11px] text-ink-faint sm:text-xs">
            <span className="sm:hidden">{SHORT_LABELS[m.indicator] ?? m.indicator}</span>
            <span className="hidden sm:inline">{LABELS[m.indicator] ?? m.indicator}</span>
          </p>
          {/* The unit wraps under the figure on narrow screens rather than
              pushing the card wider: "129.5 KES/USD" does not fit a third of a
              360px row, and overflowed the page by 3px. */}
          <p className="num mt-1 text-base font-bold text-ink sm:text-xl">
            {m.value}
            <span className="ml-1 inline-block text-xs font-normal text-ink-muted sm:text-sm">{m.unit}</span>
          </p>
          {/* The date is shown on EVERY screen size now. It used to be
              sm:block only, which hid it on exactly the devices most of this
              audience uses. On a phone the source is dropped instead — the
              date is what tells a reader whether to trust the number. */}
          {/* The month a monthly figure DESCRIBES, not the day we read it.
              A CPI print scraped on 5 August reports July; dating it to
              August overstated its currency by a month on the one line whose
              job is to say how current the number is. See vintageLabel. */}
          <p className="mt-1 text-[11px] text-ink-faint">
            <span className="hidden sm:inline">{m.source} · </span>
            {vintageLabel(m.date, m.period)}
          </p>
          {note && (
            <p className="mt-1 text-[11px] font-medium leading-snug text-gold-800">{note}</p>
          )}
        </div>
        );
      })}
    </div>
  );
}
