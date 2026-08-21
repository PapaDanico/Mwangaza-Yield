'use client';

/**
 * What the market expects of inflation, shown as opinion rather than fact.
 *
 * WHY IT LOOKS DIFFERENT FROM EVERY OTHER PANEL
 * ---------------------------------------------
 * Every other figure on this site was measured by somebody: the CBR was set at
 * an MPC meeting, the CPI released by KNBS, the auction cleared where it
 * cleared. These are the opinions of 400 firms, collected by CBK before an MPC
 * meeting. A reader who cannot tell the two apart will act on a forecast as
 * though it were a count.
 *
 * So the panel says "expect" in its heading, carries the survey and its date
 * in the body rather than in a footnote nobody reads, and reports banks and
 * non-bank firms as two separate columns. That last choice is deliberate: they
 * differ by more than a point at the one-year horizon, and a blended number
 * would hide the most interesting thing in the July survey — that the people
 * lending money and the people borrowing it do not agree about inflation.
 */

import { useMemo } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { inflationExpectations, expectationsSource } from '@/lib/expectations';

export default function MarketExpectations() {
  const macro = useBondStore((s) => s.macro);
  const horizons = useMemo(() => inflationExpectations(), []);
  const survey = useMemo(() => expectationsSource(), []);

  /** The latest measured CPI, for the one comparison worth drawing. */
  const actualCpi = useMemo(() => {
    const rows = macro
      .filter((m) => m.indicator === 'CPI')
      .sort((a, b) => b.date.localeCompare(a.date));
    return rows[0]?.value ?? null;
  }, [macro]);

  if (!horizons.length || !survey) return null;

  const surveyDay = survey.surveyDate.slice(0, 10);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">What the market expects of inflation</h2>
        <span className="rounded-full bg-sand-200 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
          Survey, not measurement
        </span>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        CBK surveys 400 firms before each MPC meeting — 37 commercial banks, 14 microfinance
        banks, and non-bank businesses across eight towns. These are their expectations, gathered{' '}
        {surveyDay}. They are opinions about the future, and the two groups disagree.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint">
              <th className="py-2 font-medium">Horizon</th>
              <th className="py-2 text-right font-medium">Banks expect</th>
              <th className="py-2 text-right font-medium">Non-bank firms expect</th>
              <th className="py-2 text-right font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {horizons.map((h) => {
              const gap =
                h.banks !== null && h.nonBanks !== null ? Math.abs(h.banks - h.nonBanks) : null;
              return (
                <tr key={h.horizonMonths} className="border-t border-sand-200">
                  <td className="py-2 text-ink">{h.horizon}</td>
                  <td className="num py-2 text-right text-ink">
                    {h.banks === null ? '—' : `${h.banks.toFixed(2)}%`}
                  </td>
                  <td className="num py-2 text-right text-ink">
                    {h.nonBanks === null ? '—' : `${h.nonBanks.toFixed(2)}%`}
                  </td>
                  <td className="num py-2 text-right text-ink-muted">
                    {gap === null ? '—' : `${gap.toFixed(2)}pp`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {actualCpi !== null && (
        <p className="mt-3 border-t border-sand-200 pt-2 text-[11px] leading-relaxed text-ink-faint">
          For comparison, inflation last <em>measured</em>{' '}
          <span className="num font-semibold text-ink-soft">{actualCpi.toFixed(2)}%</span>. Expectations
          above that imply the market thinks prices will accelerate; below it, that they will ease.
        </p>
      )}

      <p className="mt-2 text-[11px] text-ink-faint">
        Source:{' '}
        <a
          href={survey.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ink-soft"
        >
          {survey.source}
        </a>
      </p>
    </section>
  );
}
