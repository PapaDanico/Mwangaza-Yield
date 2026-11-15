'use client';

import { useMemo } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { analyseLadder, THRESHOLDS } from '@/lib/ladder-analysis';
import { SMOOTHING_PENALTY_PP, type LadderPlan } from '@/lib/ladder';
import { CPI_MAX_AGE_DAYS, latestInflation } from '@/lib/real-yield';
import { formatKES, formatPct } from '@/lib/financial-engine';
import Fold from '@/components/shared/Fold';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatKES(Math.abs(n))}`;

/**
 * The reasoning behind a ladder and what it is exposed to, in one folded card.
 *
 * Everything here comes from `analyseLadder` and the selection record the
 * builder keeps; nothing is computed in the component. Scenario figures (a 1
 * percentage point move in yields) are labelled as scenarios, and the flags are
 * descriptions of the plan, never instructions.
 */
export default function LadderAnalysisCard({ plan }: { plan: LadderPlan }) {
  const bonds = useBondStore((s) => s.bonds);
  const macro = useBondStore((s) => s.macro);

  const analysis = useMemo(() => {
    const asOf = new Date();
    const cpi = latestInflation(macro, asOf);
    // A stale CPI print is not a reading: absence, not the last known value.
    const inflationPct = cpi && cpi.ageDays <= CPI_MAX_AGE_DAYS ? cpi.rate : null;
    return analyseLadder(plan, { asOf, universe: bonds, inflationPct });
  }, [plan, bonds, macro]);

  if (!plan.rungs.length) return null;
  const { portfolio: p, rungs, flags } = analysis;
  const sel = plan.selection;

  return (
    <Fold title="Why these bonds, and what this ladder is exposed to">
      <div className="space-y-5 text-sm leading-relaxed text-ink-soft">
        {/* 1. Selection */}
        <section aria-labelledby="la-sel">
          <h3 id="la-sel" className="text-sm font-semibold text-ink">How each bond was chosen</h3>
          {sel?.mode === 'chosen' || !sel ? (
            <p className="mt-1">You chose these bonds yourself, so the tool did not rank alternatives. Everything below describes the ladder you built.</p>
          ) : (
            <>
              <p className="mt-1">
                {sel.objective === 'smooth-income'
                  ? `The horizon is split into equal windows. In each, bonds are ranked by net yield less ${SMOOTHING_PENALTY_PP} points for every coupon month an earlier rung already pays, so the ladder pays in more months. The score shown is that adjusted figure.`
                  : 'The horizon is split into equal windows. In each, the bond with the highest net yield at its price is taken; where a window has no bond, the best remaining yield fills in.'}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Maturity windows, the bond chosen in each and the alternatives ranked</caption>
                  <thead>
                    <tr className="border-b border-sand-300 text-ink-muted">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Maturing between</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Chosen</th>
                      <th scope="col" className="py-1.5 font-medium">Also considered (net yield{sel.objective === 'smooth-income' ? ', score' : ''})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.windows.map((w) => (
                      <tr key={w.from} className="border-b border-sand-200 align-top last:border-0">
                        <td className="num py-1.5 pr-3 text-ink">{monthYear(w.from)} to {monthYear(w.to)}</td>
                        <td className="py-1.5 pr-3 font-medium text-ink">{w.chosen ?? 'No bond matures in this window'}</td>
                        <td className="num py-1.5 text-ink-soft">
                          {w.ranked.slice(1).length
                            ? w.ranked.slice(1).map((r) => `${r.issueCode} ${formatPct(r.netYTM)}${sel.objective === 'smooth-income' && Math.abs(r.score - r.netYTM) > 1e-9 ? `, ${formatPct(r.score)}` : ''}`).join(' · ')
                            : 'none'}
                          {w.others > 0 ? ` · ${w.others} more` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sel.backfilled.length > 0 && (
                <p className="mt-1 text-xs text-ink-muted">Added because their window had no bond: {sel.backfilled.join(', ')}.</p>
              )}
            </>
          )}
        </section>

        {/* 2. Bond by bond */}
        <section aria-labelledby="la-rungs">
          <h3 id="la-rungs" className="text-sm font-semibold text-ink">Bond by bond</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <caption className="sr-only">Each bond&apos;s yield, sensitivity to a rise in yields, position against the curve and price basis</caption>
              <thead>
                <tr className="border-b border-sand-300 text-ink-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Bond</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Matures</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Net yield</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Duration (yrs)</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">If yields +1 point</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Against curve</th>
                  <th scope="col" className="py-1.5 font-medium">Price basis</th>
                </tr>
              </thead>
              <tbody>
                {rungs.map((r) => (
                  <tr key={r.isin} className="border-b border-sand-200 last:border-0">
                    <th scope="row" className="py-1.5 pr-3 font-medium text-ink">
                      {r.issueCode}{r.taxExempt && <span className="ml-1 font-normal text-mint-700">tax-free</span>}
                    </th>
                    <td className="num py-1.5 pr-3 text-right text-ink">{monthYear(r.maturityDate)}</td>
                    <td className="num py-1.5 pr-3 text-right text-ink">
                      {formatPct(r.netYTM)}
                      {r.taxableEquivalentPct != null && <span className="block text-ink-muted">= {formatPct(r.taxableEquivalentPct)} taxable</span>}
                    </td>
                    <td className="num py-1.5 pr-3 text-right text-ink">{r.modifiedDuration != null ? r.modifiedDuration.toFixed(1) : 'n/a'}</td>
                    <td className="num py-1.5 pr-3 text-right text-ink">{r.valueChangeUp100KES != null ? signed(r.valueChangeUp100KES) : 'n/a'}</td>
                    <td className="num py-1.5 pr-3 text-right text-ink">{r.gapToCurveBp != null ? `${r.gapToCurveBp > 0 ? '+' : r.gapToCurveBp < 0 ? '−' : ''}${Math.abs(Math.round(r.gapToCurveBp))}bp` : 'n/a'}</td>
                    <td className={r.priceQuality === 'placeholder' ? 'py-1.5 text-gold-700' : 'py-1.5 text-ink-soft'}>
                      {r.priceQuality === 'placeholder' ? 'par placeholder' : r.priceQuality}
                      {r.yieldAgeDays != null && r.yieldAgeDays > THRESHOLDS.staleYieldDays ? `, auction ${r.yieldAgeDays}d old` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. The ladder as a whole */}
        <section aria-labelledby="la-whole">
          <h3 id="la-whole" className="text-sm font-semibold text-ink">The ladder as a whole</h3>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Fact label="Average life of the principal" value={`${p.weightedAvgLifeYears.toFixed(1)} years`} />
            <Fact label="Modified duration" value={p.modifiedDuration != null ? `${p.modifiedDuration.toFixed(1)} years` : 'n/a'} />
            <Fact
              label="Scenario: yields +1 point"
              value={p.valueChangeUp100KES != null ? `${signed(p.valueChangeUp100KES)} (${p.valueChangeUp100Pct!.toFixed(1)}%) market value` : 'n/a'}
              note="Only felt if you sell before maturity."
            />
            <Fact
              label="Scenario: yields −1 point"
              value={p.valueChangeDown100KES != null ? `${signed(p.valueChangeDown100KES)} market value` : 'n/a'}
            />
            <Fact
              label="Spread of maturities"
              value={`${p.effectiveMaturityYears.toFixed(1)} effective years; largest is ${p.maturityYearShares[0].year} at ${(p.maturityYearShares[0].share * 100).toFixed(0)}%`}
            />
            <Fact label="Tax-free share of the cost" value={`${(p.taxExemptShare * 100).toFixed(0)}%`} />
            <Fact label="Back within 24 months" value={`${(p.returnsWithin24MonthsShare * 100).toFixed(0)}% of the principal`} />
            {p.realNetYieldPct != null && <Fact label="Net yield after inflation" value={`${p.realNetYieldPct.toFixed(1)}% a year, at the latest CPI held flat`} />}
          </dl>
          <p className="mt-3 text-xs font-medium text-ink-muted">Months with a coupon, next 12 months</p>
          <ul className="mt-1 flex flex-wrap gap-1" aria-label={`Coupons arrive in ${p.couponMonths.length} of 12 months`}>
            {MONTHS.map((m, i) => {
              const on = p.couponMonths.includes(i + 1);
              return (
                <li key={m} className={`num min-w-11 rounded border px-1.5 py-1 text-center text-xs ${on ? 'border-mint-600/40 bg-mint-600/10 text-ink' : 'border-sand-300 text-ink-faint'}`}>
                  {m}<span className="sr-only">{on ? ': coupon' : ': no coupon'}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 4. Flags */}
        {flags.length > 0 && (
          <section aria-labelledby="la-flags">
            <h3 id="la-flags" className="text-sm font-semibold text-ink">What to look at</h3>
            <ul className="mt-2 space-y-2">
              {flags.map((f, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-semibold ${f.level === 'watch' ? 'bg-gold-500/20 text-gold-800' : 'bg-sand-200 text-ink-soft'}`}>
                    {f.level === 'watch' ? 'Check' : 'Context'}
                  </span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="border-t border-sand-200 pt-3 text-xs text-ink-faint">
          Durations and the one-point scenarios come from exact repricing of each bond&apos;s remaining cash flows at today&apos;s yield; they are scenarios,
          not forecasts. &ldquo;Against curve&rdquo; compares a taxable bond&apos;s yield with a curve fitted to the latest auctions
          {p.curve ? ` (${p.curve.n} bonds, fit error ${Math.round(p.curve.rmseBp)}bp)` : ' (not available today)'}. Flags use fixed thresholds
          (one maturity year above {THRESHOLDS.maturityYearShare * 100}%, one kind of bond above {THRESHOLDS.categoryShare * 100}%, duration above {THRESHOLDS.longDurationYears} years,
          more than {THRESHOLDS.soonShare * 100}% back within 24 months) and describe the plan; they are not advice. Educational planning, based on published CBK data.
        </p>
      </div>
    </Fold>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num font-medium text-ink">{value}{note && <span className="block font-normal text-ink-faint">{note}</span>}</dd>
    </div>
  );
}
