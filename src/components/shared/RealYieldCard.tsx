'use client';

import { useMemo, useState } from 'react';
import type { Bond, MacroIndicator } from '@/types/bond';
import { latestInflation, realReturn, exemptionRealMultiple } from '@/lib/real-yield';
import { formatKES } from '@/lib/financial-engine';

/**
 * The number the rest of the page is missing.
 *
 * Everything above this card is nominal. This deflates it by the CPI print the
 * app already carries and says what the money is worth — including the part a
 * yield figure structurally cannot show, which is that the principal comes back
 * at its original face value however long it has been away.
 *
 * The inflation rate is editable on purpose. Holding one month's y/y print
 * constant for fifteen years is an assumption and the reader should be able to
 * disagree with it in one tap rather than be told what the future holds.
 */
export default function RealYieldCard({
  bond,
  netYTM,
  grossYTM,
  macro,
}: {
  bond: Bond;
  netYTM: number;
  grossYTM: number;
  macro: MacroIndicator[];
}) {
  const reading = useMemo(() => latestInflation(macro), [macro]);
  const [override, setOverride] = useState<number | null>(null);
  const rate = override ?? reading?.rate ?? null;

  const real = useMemo(
    () => (rate === null ? null : realReturn(bond, netYTM, grossYTM, rate)),
    [bond, netYTM, grossYTM, rate],
  );

  if (!reading) {
    // No CPI print, no real yield. Saying nothing beats inventing a rate.
    return null;
  }

  const multiple = rate === null ? null : exemptionRealMultiple(grossYTM, netYTM, rate);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">In today&rsquo;s money</h2>
        <span className="rounded-full bg-sand-200 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
          {reading.rate.toFixed(2)}% CPI
        </span>
      </div>

      {real && (
        <>
          <div className="flex items-baseline justify-between border-b border-sand-200 py-2">
            <span className="text-sm text-ink-soft">
              What you keep after tax <em>and</em> inflation
            </span>
            <span
              className={`num text-lg font-semibold ${real.gainsPurchasingPower ? 'text-mint-700' : 'text-red-600'}`}
            >
              {real.realNetYTM.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-baseline justify-between border-b border-sand-200 py-2">
            <span className="text-sm text-ink-soft">The nominal figure above</span>
            <span className="num text-ink-soft">{real.nominalNetYTM.toFixed(2)}%</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-sand-200 py-2">
            <span className="text-sm text-ink-soft">
              What {formatKES(100, 0)} of principal buys when it comes back
            </span>
            <span className="num text-ink">
              {formatKES(real.principalRealValuePer100, 0)}
            </span>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <span className="text-sm text-ink-soft">
              Inflation would have to average above
            </span>
            <span className="num text-ink">{real.breakEvenInflationPct.toFixed(2)}%</span>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{real.summary}</p>

          {multiple !== null && multiple > 1.05 && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
              Worth knowing when comparing this to an infrastructure bond: a tax exemption is
              worth about {multiple.toFixed(1)}× more as a share of your <em>real</em> return
              than it looks as a share of the headline, because it is measured against a much
              smaller base once inflation is taken off.
            </p>
          )}
        </>
      )}

      <div className="mt-3 border-t border-sand-200 pt-3">
        <label
          htmlFor="cpi-assumption"
          className="block text-[12px] font-medium text-ink-soft"
        >
          Assume inflation averages
        </label>
        <div className="mt-1.5 flex items-center gap-3">
          <input
            id="cpi-assumption"
            type="range"
            min={0}
            max={20}
            step={0.1}
            value={rate ?? reading.rate}
            onChange={(e) => setOverride(Number(e.target.value))}
            className="h-11 flex-1"
          />
          <span className="num w-16 text-right text-sm font-semibold text-ink">
            {(rate ?? reading.rate).toFixed(1)}%
          </span>
        </div>
        {override !== null && (
          <button
            type="button"
            onClick={() => setOverride(null)}
            className="mt-1 min-h-11 text-[12px] font-medium text-mint-700 underline"
          >
            Back to the published {reading.rate.toFixed(2)}%
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Real return uses the Fisher relation — (1 + nominal) ÷ (1 + inflation) − 1 — applied to
        the yield <em>after</em> withholding tax, because tax is charged on the nominal coupon
        and inflation deflates what survives it. Inflation is{' '}
        {reading.source} as at {reading.asOf}
        {reading.fallback
          ? ' — a stand-in, because KNBS, which publishes the official CPI, could not be reached'
          : ''}
        {reading.stale ? ', which is older than we would like' : ''}. Holding one month&rsquo;s
        reading constant for the life of a bond is an assumption, not a forecast: Kenyan
        inflation was above 9% as recently as 2023. Move the slider to test your own.
      </p>
    </div>
  );
}
