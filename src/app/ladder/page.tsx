'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Layers, Share2, X, RotateCcw } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { CoverageNotice, PriceBadge } from '@/components/shared/PriceProvenance';
import { buildLadder } from '@/lib/ladder';
import { formatKES, formatPct, getCouponDates } from '@/lib/financial-engine';
import { downloadICS, type CalendarEvent } from '@/lib/ics';
import { APP_URL, formatLadderSummary, shareText } from '@/lib/share';
import { nonNegativeNumber } from '@/lib/utils';
import { usePersistedState } from '@/lib/persisted';
import { track } from '@/lib/analytics';
import LadderReport from '@/components/report/LadderReport';
import ReportActions from '@/components/report/ReportActions';
import LiveResult from '@/components/shared/LiveResult';

export default function LadderPage() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const userPrices = usePriceStore((s) => s.userPrices);
  // Persisted, not useState. A reader who hand-builds a six-rung ladder and
  // comes back to find it gone has not been given a tool, and on a phone that
  // happens without them ever deciding to leave. See lib/persisted.ts.
  const [amount, setAmount] = usePersistedState('ladder:amount', 3_000_000);
  const [horizon, setHorizon] = usePersistedState('ladder:horizon', 10);
  const [rungCount, setRungCount] = usePersistedState('ladder:rungs', 4);
  /**
   * Bonds the reader has chosen for themselves.
   *
   * Empty means "let the tool pick" — the default, and the state most readers
   * stay in. The moment they change one rung we hold the WHOLE selection, not
   * a diff against the automatic pick: an override expressed as "swap rung 2"
   * silently re-resolves when the amount or horizon changes the auto-pick
   * underneath it, and the ladder would rearrange itself around a choice the
   * reader thought they had fixed.
   */
  const [chosenIsins, setChosenIsins] = usePersistedState<string[]>('ladder:chosen', []);
  const tailored = chosenIsins.length > 0;
  // Set after mount: a build-time date would mismatch on hydration.
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })), []);

  const plan = useMemo(
    () => buildLadder(bonds, secondary, amount, horizon, rungCount, new Date(), userPrices, chosenIsins),
    [bonds, secondary, userPrices, amount, horizon, rungCount, chosenIsins]
  );

  /** Every bond a reader could still buy, soonest maturity first. */
  const selectable = useMemo(() => {
    const now = new Date();
    return bonds
      .filter((b) => new Date(b.maturityDate) > now)
      .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
  }, [bonds]);

  /** Swap one rung, promoting the current auto-pick to an explicit selection. */
  const swapRung = (index: number, isin: string) => {
    const base = tailored ? chosenIsins : plan.rungs.map((r) => r.bond.isin);
    const next = [...base];
    next[index] = isin;
    setChosenIsins(next);
  };

  const dropRung = (index: number) => {
    const base = tailored ? chosenIsins : plan.rungs.map((r) => r.bond.isin);
    setChosenIsins(base.filter((_, i) => i !== index));
  };

  const addRung = (isin: string) => {
    const base = tailored ? chosenIsins : plan.rungs.map((r) => r.bond.isin);
    setChosenIsins([...base, isin]);
  };

  useEffect(() => {
    if (plan.rungs.length) track('act:ladder-built');
  }, [plan]);

  const maxYear = Math.max(...plan.yearlyPayouts.map((p) => p.couponsKES + p.principalKES), 1);

  function exportCalendar() {
    const events: CalendarEvent[] = [];
    for (const r of plan.rungs) {
      const dates = getCouponDates(new Date(r.bond.issueDate), new Date(r.bond.maturityDate), r.bond.couponFrequencyPerYear || 2)
        .filter((d) => d > new Date());
      for (const d of dates) {
        const iso = d.toISOString().slice(0, 10);
        const isMaturity = iso === r.bond.maturityDate;
        events.push({
          date: iso,
          title: `${r.bond.issueCode} ${isMaturity ? 'matures' : 'coupon'}`,
          description: isMaturity
            ? `Principal ${formatKES(r.faceValueKES)} + final coupon ${formatKES(r.result.netCouponPerPeriodKES)} (net)`
            : `Net coupon ${formatKES(r.result.netCouponPerPeriodKES)}`,
        });
      }
    }
    downloadICS(events, 'mwangaza-ladder.ics', 'Mwangaza Yield — Ladder');
  }

  const inputCls =
    'w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold-500';

  return (
    <div className="space-y-5">
      <LadderReport plan={plan} horizon={horizon} generatedAt={today} />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Money that arrives year after year</h1>
          <p className="text-sm text-ink-muted">
            Rather than tying everything up until one distant date, spread it so a bond repays
            each year. Bankers call this a ladder.
          </p>
        </div>
        {plan.rungs.length > 0 && (
          /* flex-wrap, not bare flex: without it the export group and Share
             were pinned on one line and overflowed a 390px screen. */
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <ReportActions sheetId="ladder-report-sheet" filename="mwangaza-ladder-plan" />
            <button
              onClick={() =>
                shareText(formatLadderSummary(plan, APP_URL))
              }
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-mint-600 px-3 py-2 text-sm font-semibold text-white hover:bg-mint-700 sm:flex-none"
            >
              <Share2 size={15} /> Share
            </button>
          </div>
        )}
      </div>

      {/* min-w-0 on the items is what makes the inner overflow-x-auto containers
          work. A grid item defaults to min-width:auto, so it refuses to shrink
          below its content's min-content — here a results table (499px) and the
          payout chart (538px). The column therefore sized to 538px inside a
          420px viewport and the WHOLE PAGE scrolled sideways, dragging the form
          card, the amount input and both sliders off-screen with it. The
          scroll containers were already there; they just never got the chance
          to engage. 194px of overflow at 360px, on a phone-first app. */}
      <div className="no-print grid gap-5 lg:grid-cols-[1fr,1.4fr] [&>*]:min-w-0">
        <div className="card h-fit space-y-4">
          <div>
            <label htmlFor="ladder-amount" className="mb-1 block text-sm font-medium text-ink-soft">Total to invest (KES)</label>
            <input
              id="ladder-amount"
              type="number" min={100_000} step={50_000} value={amount}
              onChange={(e) => setAmount(nonNegativeNumber(e.target.value))}
              className={`num ${inputCls}`}
            />
          </div>
          <div>
            <label htmlFor="ladder-horizon" className="mb-1 flex justify-between text-sm font-medium text-ink-soft">
              <span>Horizon</span><span className="num text-gold-700">{horizon} years</span>
            </label>
            <input
              id="ladder-horizon"
              type="range" min={2} max={25} step={1} value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="h-11 w-full cursor-pointer accent-gold-600"
            />
          </div>
          <div>
            <label htmlFor="ladder-rungs" className="mb-1 flex justify-between text-sm font-medium text-ink-soft">
              <span>Rungs (bonds)</span><span className="num text-gold-700">{rungCount}</span>
            </label>
            <input
              id="ladder-rungs"
              type="range" min={2} max={6} step={1} value={rungCount}
              onChange={(e) => setRungCount(Number(e.target.value))}
              className="h-11 w-full cursor-pointer accent-gold-600"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Rungs are spread across the horizon — best net yield in each window, one bond per
            maturity year, tax-free IFBs competing on equal footing. Where the market has no paper
            in a window, the next-best yield fills in. Equal split in KES 50k steps, priced from
            your price book where you have recorded one and par where nobody has.
            Educational planning — actual auction allocations vary.
          </p>
        </div>

        <div className="space-y-4">
          {plan.rungs.length === 0 ? (
            <div className="card py-12 text-center text-sm text-ink-muted">
              <Layers size={22} className="mx-auto mb-3 text-ink-faint" />
              Nothing to allocate: either no listed bonds mature within {horizon} years, or{' '}
              {formatKES(amount)} split {rungCount} ways falls below the bonds&apos; minimums.
              Extend the horizon, raise the amount, or use fewer rungs.
            </div>
          ) : (
            <>
              {/* Three across only once there is room. Forced to grid-cols-3 at
                  every width, the three figures' min-content (~538px, monospace
                  and unbreakable) set the width of the single grid column this
                  shares with the form above — so the amount input and both
                  sliders were dragged off-screen too. The page overflowed by
                  134px at 420 and 194px at 360, on an app whose readers are on
                  phones. min-w-0 lets each card shrink rather than push. */}
              <LiveResult>
                {`${plan.rungs.length} rungs over ${horizon} years: ${formatPct(plan.blendedNetYTM)} blended net yield, `
                  + `${formatKES(plan.netAnnualIncomeKES)} net income a year, `
                  + `${formatKES(plan.totalCostKES)} total cost.`}
              </LiveResult>

              {/* Above the figures, not below them: whether these yields rest on
                  real prices decides how much weight the reader should give the
                  three numbers that follow. */}
              <div className="no-print"><CoverageNotice coverage={plan.priceCoverage} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
                <div className="card p-4">
                  <p className="text-xs text-ink-muted">Blended net yield</p>
                  <p className="num mt-1 text-lg font-bold text-gold-700">{formatPct(plan.blendedNetYTM)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-ink-muted">Net annual income</p>
                  <p className="num mt-1 text-lg font-bold text-mint-700">{formatKES(plan.netAnnualIncomeKES)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-ink-muted">Total cost</p>
                  <p className="num mt-1 text-lg font-bold text-ink">{formatKES(plan.totalCostKES)}</p>
                </div>
              </div>

              {tailored && (
                <div className="no-print flex flex-wrap items-center gap-3 rounded-xl bg-sand-100 px-4 py-3 text-xs text-ink-soft">
                  <span>
                    This is <strong>your</strong> selection — {plan.rungs.length}{' '}
                    bond{plan.rungs.length === 1 ? '' : 's'} you chose, not the ones we would pick.
                    The horizon slider no longer filters it.
                  </span>
                  <button
                    onClick={() => setChosenIsins([])}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-sand-300 px-3 py-1.5 font-medium text-ink transition-colors hover:bg-sand-200"
                  >
                    <RotateCcw size={13} /> Back to our picks
                  </button>
                </div>
              )}

              <div className="card overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="px-3 py-3">Rung</th>
                      <th className="px-3 py-3 text-right">Face value</th>
                      <th className="px-3 py-3 text-right">Price</th>
                      <th className="px-3 py-3 text-right">Net yield</th>
                      <th className="px-3 py-3 text-right">Matures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rungs.map((r, i) => (
                      <tr key={r.bond.isin} className="border-b border-sand-300/60 last:border-0">
                        <td className="px-3 py-3">
                          {/* A real select, not a custom menu: 58 bonds is a long
                              list, and the platform control already gives type-to-
                              find, keyboard navigation and a native picker on a
                              phone. Rebuilding that badly is the usual cost of a
                              prettier one. */}
                          <label className="sr-only" htmlFor={`rung-${i}`}>Bond for rung {i + 1}</label>
                          <div className="flex items-center gap-1.5">
                            <select
                              id={`rung-${i}`}
                              value={r.bond.isin}
                              onChange={(e) => swapRung(i, e.target.value)}
                              className="min-h-9 max-w-[11rem] rounded-lg border border-sand-300 bg-white px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-gold-600"
                            >
                              {selectable.map((b) => (
                                <option key={b.isin} value={b.isin}>
                                  {b.issueCode}{b.taxExempt ? ' · tax-free' : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => dropRung(i)}
                              aria-label={`Remove ${r.bond.issueCode} from the ladder`}
                              title="Remove this rung"
                              /* 36px, not 44: this sits inside a dense table
                                 row, where a 44px target would push the ladder
                                 to a scroll on every phone. 36 clears the WCAG
                                 2.5.8 minimum with room, on a control whose
                                 only job is destructive. */
                              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-sand-200 hover:text-ink"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="num px-3 py-3 text-right text-ink">{formatKES(r.faceValueKES)}</td>
                        <td className="px-3 py-3 text-right">
                          <span className="num text-ink">{r.price.toFixed(2)}</span>
                          <PriceBadge info={r.priceInfo} className="ml-1.5 align-middle" />
                        </td>
                        <td className="num px-3 py-3 text-right text-gold-700">{formatPct(r.result.netYTM)}</td>
                        <td className="num px-3 py-3 text-right text-ink-soft">{r.bond.maturityDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="no-print flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <label htmlFor="add-rung" className="font-medium">Add a bond:</label>
                <select
                  id="add-rung"
                  value=""
                  onChange={(e) => { if (e.target.value) addRung(e.target.value); }}
                  className="min-h-11 max-w-[15rem] rounded-lg border border-sand-300 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold-600"
                >
                  <option value="">Choose a bond…</option>
                  {selectable
                    .filter((b) => !plan.rungs.some((r) => r.bond.isin === b.isin))
                    .map((b) => (
                      <option key={b.isin} value={b.isin}>
                        {b.issueCode} · matures {b.maturityDate}{b.taxExempt ? ' · tax-free' : ''}
                      </option>
                    ))}
                </select>
                <span className="text-ink-faint">
                  Capital re-splits evenly across every rung, in KES 50k steps.
                </span>
              </div>

              <div className="card">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-ink">Net cash by year</h2>
                    <p className="text-xs text-ink-faint">Coupons (gold) and principal returned (emerald)</p>
                  </div>
                  <button
                    onClick={exportCalendar}
                    className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-sand-50 hover:bg-ink-soft"
                  >
                    <CalendarPlus size={15} /> Add to calendar
                  </button>
                </div>
                <div className="flex items-end gap-2 overflow-x-auto pb-1">
                  {plan.yearlyPayouts.map((p) => {
                    const total = p.couponsKES + p.principalKES;
                    return (
                      <div key={p.year} className="flex min-w-[3rem] flex-1 flex-col items-center gap-1">
                        <span className="num text-[10px] text-ink-soft">
                          {total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${Math.round(total / 1000)}k`}
                        </span>
                        <div className="flex h-28 w-full flex-col-reverse rounded-lg bg-sand-200 p-1" title={`${p.year}: ${formatKES(total)}`}>
                          <div className="w-full rounded-b bg-gold-500" style={{ height: `${(p.couponsKES / maxYear) * 100}%`, minHeight: p.couponsKES > 0 ? 3 : 0 }} />
                          <div className="w-full rounded-t bg-mint-600" style={{ height: `${(p.principalKES / maxYear) * 100}%`, minHeight: p.principalKES > 0 ? 3 : 0 }} />
                        </div>
                        <span className="num text-[10px] text-ink-muted">{p.year}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
