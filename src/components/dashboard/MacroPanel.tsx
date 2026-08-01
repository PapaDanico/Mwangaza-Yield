'use client';

import { useBondStore } from '@/stores/bondStore';
import Reserve from '@/components/shared/Reserve';

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

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {macro.map((m) => (
        <div key={m.id} className="card p-3 sm:p-4">
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
          <p className="mt-1 hidden text-[11px] text-ink-faint sm:block">{m.source} · {m.date}</p>
        </div>
      ))}
    </div>
  );
}
