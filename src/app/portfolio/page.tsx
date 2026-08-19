'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Trash2, Download, Share2, CheckCircle2 } from 'lucide-react';
import { APP_URL, formatPortfolioSummary, shareText } from '@/lib/share';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { usePriceStore } from '@/stores/priceStore';
import { resolvePrice } from '@/lib/prices';
import { computeBondInvestment, formatKES, formatPct, getNextCouponDate } from '@/lib/financial-engine';
import { paymentDay } from '@/lib/holidays';
import {
  computeBondRiskMetrics,
  computePortfolioWeightedDuration,
  computePriceSensitivity,
} from '@/lib/riskMetrics';
import { buildPortfolioPaymentSchedule, buildWaterfallSeries } from '@/lib/portfolioCashFlows';
import type { Bond, Holding } from '@/types/bond';
import { normaliseCode } from '@/lib/auction-history';
import { looksLikeDhowCsd, parseDhowCsd, toHoldings } from '@/lib/dhowcsd';
import IncomeStabilityDashboard from '@/components/portfolio/IncomeStabilityDashboard';

const RiskMetricsDurationChart = dynamic(
  () => import('@/components/portfolio/RiskMetricsDurationChart'),
  { ssr: false, loading: () => <div className="h-64" aria-hidden="true" /> },
);
const CashFlowWaterfall = dynamic(() => import('@/components/CashFlowWaterfall'), {
  ssr: false,
  loading: () => <div className="h-80" aria-hidden="true" />,
});
const CouponCalendarHeatmap = dynamic(() => import('@/components/CouponCalendarHeatmap'), {
  ssr: false,
  loading: () => <div className="h-80" aria-hidden="true" />,
});

/**
 * Find the bond a holding refers to.
 *
 * ISIN first, because it is unambiguous. Then the issue code, NORMALISED —
 * DhowCSD writes IFB1/2022/018 and bonds.json carries IFB1/2022/18, so an
 * exact string match misses a bond we hold data for and reports it to the
 * reader as unknown. That is the same padding mismatch auction-history
 * documents; the difference here is that it silently emptied a portfolio.
 */
function matchBond(bonds: Bond[], h: { isin?: string; issueCode: string }): Bond | null {
  if (h.isin) {
    const byIsin = bonds.find((b) => b.isin === h.isin);
    if (byIsin) return byIsin;
  }
  const want = normaliseCode(h.issueCode);
  return bonds.find((b) => normaliseCode(b.issueCode) === want) ?? null;
}

const CSV_TEMPLATE = 'issueCode,faceValueKES,purchaseDate,purchaseCleanPrice\nFXD1/2022/010,1000000,2026-07-13,100\nIFB1/2022/019,500000,2026-02-16,100\n';

export default function PortfolioPage() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const { holdings, addHoldings, removeHolding, clear, loaded: holdingsLoaded } = usePortfolioStore();
  const userPrices = usePriceStore((s) => s.userPrices);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState<{ ok: number; skipped: number; unknown: string[]; fromCustody?: boolean } | null>(null);
  const [showRiskMetrics, setShowRiskMetrics] = useState(true);
  const [portfolioView, setPortfolioView] = useState<'waterfall' | 'calendar' | 'list'>('list');
  const [waterfallMonths, setWaterfallMonths] = useState<12 | 24 | 36 | 60>(12);
  const [reinvestmentRate, setReinvestmentRate] = useState<number | null>(null);

  const enriched = useMemo(() => {
    const today = new Date();
    return holdings.map((h) => {
      const bond = matchBond(bonds, h);
      if (!bond) return {
        holding: h,
        bond: null,
        result: null,
        currentCost: null,
        market: null,
        nextCoupon: null,
      };
      // Locked-in economics from the price actually paid.
      //
      // When the cost basis is unknown — a custody export states what is held,
      // never what was paid — this still runs, because the half of it that
      // matters does not depend on price at all. Coupon amounts, the payment
      // calendar, withholding tax and maturity proceeds are functions of face
      // value and the coupon rate. Only the yields and the settlement cost are
      // functions of price, and those are suppressed in the table and the
      // summary rather than shown against a placeholder.
      //
      // An empty purchase date would make `new Date('')` invalid and turn
      // accrued interest into NaN, so today stands in for settlement.
      const settlement = h.purchaseDate ? new Date(h.purchaseDate) : new Date();
      const result = computeBondInvestment(bond, h.faceValueKES, h.purchaseCleanPrice, settlement);
      // ...versus what the same bond yields at today's price.
      //
      // This looked only at `secondary`, which ships empty because we publish no
      // market prices at all — so the mark-to-market column never once rendered
      // for anybody. Reading the price book too makes it work for a
      // reader who has recorded what their bonds are worth.
      //
      // Par is deliberately NOT accepted here. Everywhere else par is a
      // declared placeholder the reader can see; a valuation is different —
      // "your bond is worth 100" is a claim about their money, and inventing it
      // would be worse than leaving the column blank.
      const priceInfo = resolvePrice(bond, secondary, userPrices);
      const currentCost = h.costBasisKnown === false
        ? null
        : computeBondInvestment(bond, h.faceValueKES, h.purchaseCleanPrice, today);
      const market = priceInfo.source !== 'par'
        ? computeBondInvestment(bond, h.faceValueKES, priceInfo.price, today)
        : null;
      const nextCoupon = getNextCouponDate(bond, today);
      return { holding: h, bond, result, currentCost, market, nextCoupon };
    });
  }, [holdings, bonds, secondary, userPrices]);

  const totals = useMemo(() => {
    const valid = enriched.filter((e) => e.result);
    // Income is exact for every holding: a coupon is face value times the
    // coupon rate, and no part of it depends on what was paid.
    const income = valid.reduce((s, e) => s + e.result!.netAnnualIncomeKES, 0);
    // Cost and the cost-weighted yield are not. A holding imported from a
    // custody statement carries a placeholder price, and including it here
    // would put an invented figure into a portfolio total — where it is least
    // visible and most likely to be believed.
    const priced = valid.filter((e) => e.holding.costBasisKnown !== false);
    const cost = priced.reduce((s, e) => s + e.result!.settlementCostKES, 0);
    const weightedNet = cost > 0
      ? priced.reduce((s, e) => s + e.result!.netYTM * e.result!.settlementCostKES, 0) / cost
      : 0;
    const unpriced = valid.length - priced.length;
    return { cost, income, weightedNet, unpriced };
  }, [enriched]);

  const risk = useMemo(() => {
    const today = new Date();
    const rows = enriched.flatMap((entry) => {
      const { bond, holding, currentCost, market } = entry;
      if (!bond) return [];
      const valuation = market ?? currentCost;
      if (!valuation) return [];
      const metrics = computeBondRiskMetrics(bond, holding.faceValueKES, valuation.netYTM, today);
      if (!metrics.cashFlows.length) return [];
      return [{
        holdingId: holding.id,
        issueCode: holding.issueCode,
        currentValue: valuation.settlementCostKES,
        source: market ? 'market' : 'cost',
        ...metrics,
      }];
    });

    const currentValue = rows.reduce((sum, row) => sum + row.currentValue, 0);
    const weightedMacaulay = computePortfolioWeightedDuration(
      rows.map((row) => ({ marketValue: row.currentValue, duration: row.macaulayDuration })),
    );
    const weightedModified = computePortfolioWeightedDuration(
      rows.map((row) => ({ marketValue: row.currentValue, duration: row.modifiedDuration })),
    );
    const portfolioConvexity = computePortfolioWeightedDuration(
      rows.map((row) => ({ marketValue: row.currentValue, duration: row.convexity })),
    );
    const scenarios = [-2, -1, -0.5, 0.5, 1, 2].map((yieldChange) => ({
      yieldChange,
      impact: computePriceSensitivity(weightedModified, portfolioConvexity, yieldChange, currentValue),
    }));

    return {
      rows,
      byHoldingId: new Map(rows.map((row) => [row.holdingId, row])),
      weightedMacaulay,
      weightedModified,
      portfolioConvexity,
      currentValue,
      scenarios,
      chartData: [...rows]
        .sort((a, b) => b.modifiedDuration - a.modifiedDuration)
        .map((row) => ({ issueCode: row.issueCode, duration: row.modifiedDuration })),
      excluded: enriched.filter((entry) => entry.bond).length - rows.length,
    };
  }, [enriched]);
  const paymentSchedule = useMemo(
    () => buildPortfolioPaymentSchedule(enriched, new Date()),
    [enriched],
  );
  const maxReinvestmentRate = useMemo(
    () => Math.max(
      ...enriched
        .map((entry) => (entry.market ?? entry.result)?.netYTM ?? 0)
        .filter((value) => value > 0),
      0,
    ),
    [enriched],
  );
  const effectiveReinvestmentRate = reinvestmentRate ?? totals.weightedNet;
  const waterfallData = useMemo(
    () => buildWaterfallSeries(paymentSchedule, waterfallMonths, effectiveReinvestmentRate, new Date()),
    [effectiveReinvestmentRate, paymentSchedule, waterfallMonths],
  );

  useEffect(() => {
    if (holdingsLoaded && holdings.length > 0) {
      setPortfolioView('list');
    }
    // Run once when the store finishes loading from IndexedDB so an existing
    // portfolio lands on the holdings table rather than an empty waterfall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingsLoaded]);

  useEffect(() => {
    setReinvestmentRate((current) => {
      if (current === null) return totals.weightedNet;
      return Math.min(current, maxReinvestmentRate || totals.weightedNet);
    });
  }, [maxReinvestmentRate, totals.weightedNet]);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        // A DhowCSD export is the file a reader already has. Asking them to
        // retype four columns out of it is asking them not to bother.
        if (looksLikeDhowCsd(res.data)) {
          const parsed = parseDhowCsd(res.data);
          const imported = toHoldings(parsed.positions).map((h) => ({
            ...h,
            isin: h.isin || matchBond(bonds, h)?.isin || '',
          }));
          if (imported.length) {
            addHoldings(imported);
            setPortfolioView('list');
          }
          setImportNote({
            ok: imported.length,
            skipped: parsed.rejected.length,
            unknown: imported.filter((h) => !matchBond(bonds, h)).map((h) => h.issueCode),
            fromCustody: true,
          });
          return;
        }

        const usable = res.data.filter((r) => r.issueCode && r.faceValueKES);
        /* Stored canonical, not as typed.
         *
         * matchBond already normalises, so a holding imported as
         * "FXD1/2022/10" found its bond. It was then SAVED as typed, leaving
         * the portfolio holding an issue code in a format nothing else in the
         * app uses — and every comparison that does not happen to route
         * through matchBond silently missed it. alerts.ts builds a Map
         * straight off issueCode to pair a holding with its bond; a coupon
         * reminder for that holding simply never fired, and a reminder that
         * does not arrive looks identical to one that was not due.
         *
         * This survived only because the catalogue was unpadded too, so the
         * two wrong halves matched. Canonicalising the data files exposed it,
         * which is the argument for one format rather than two that agree.
         *
         * The parser stays tolerant on the way in: "FXD1/2022/10" is what a
         * person types, and rejecting it would be pedantry. Accept anything,
         * store one thing. */
        const rows: Holding[] = usable
          .map((r, i) => ({
            id: `${normaliseCode(r.issueCode)}-${r.purchaseDate ?? ''}-${i}-${r.faceValueKES}`,
            isin: matchBond(bonds, { issueCode: r.issueCode.trim() })?.isin ?? '',
            issueCode: normaliseCode(r.issueCode),
            faceValueKES: Number(r.faceValueKES),
            purchaseDate: r.purchaseDate?.trim() || new Date().toISOString().slice(0, 10),
            purchaseCleanPrice: Number(r.purchaseCleanPrice) || 100,
          }));
        if (rows.length) {
          addHoldings(rows);
          setPortfolioView('list');
        }
        // Tell the user what actually landed — a silent import hides typos.
        setImportNote({
          ok: rows.length,
          skipped: res.data.length - usable.length,
          unknown: rows.filter((r) => !matchBond(bonds, r)).map((r) => r.issueCode),
        });
      },
    });
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mwangaza-portfolio-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Portfolio</h1>
          <p className="text-sm text-ink-muted">Stored locally on your device — never uploaded.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button onClick={downloadTemplate} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-400 px-3 py-2 text-sm text-ink-soft hover:border-ink-muted sm:flex-none">
            <Download size={15} /> CSV template
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-sand-50 hover:bg-ink-soft sm:flex-none">
            <Upload size={15} /> Import CSV
          </button>
          {enriched.length > 0 && (
            <button
              onClick={() =>
                shareText(
                  formatPortfolioSummary(totals, enriched.length, APP_URL)
                )
              }
              className="flex items-center gap-1.5 rounded-xl bg-mint-700 px-3 py-2 text-sm font-semibold text-white hover:bg-mint-800"
            >
              <Share2 size={15} /> Share
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv" hidden aria-label="Import holdings from a CSV file" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-ink-muted">Invested (cost)</p>
          <p className="num mt-1 text-lg font-bold text-ink">{formatKES(totals.cost)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-muted">Net annual income</p>
          <p className="num mt-1 text-lg font-bold text-mint-700">{formatKES(totals.income)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-muted">Weighted net yield</p>
          <p className="num mt-1 text-lg font-bold text-gold-700">{formatPct(totals.weightedNet)}</p>
        </div>
      </div>

      {importNote && (
        <div className="card flex items-start gap-3 border-l-4 border-l-mint-600 py-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-mint-700" />
          <div className="text-sm text-ink-soft">
            <p>
              Imported <span className="font-semibold text-ink">{importNote.ok}</span> holding
              {importNote.ok === 1 ? '' : 's'}
              {importNote.skipped > 0 && `, skipped ${importNote.skipped} incomplete row${importNote.skipped === 1 ? '' : 's'}`}.
            </p>
            {importNote.fromCustody && importNote.ok > 0 && (
              <p className="mt-1 text-ink-muted">
                Read as a DhowCSD statement. It records what you hold, not what you paid,
                so coupon amounts, the payment calendar and maturity proceeds are exact —
                these come from the face value. Yield and cost are left blank until you add
                the price you bought at, because the statement does not carry one and a
                figure invented here would look like your own.
              </p>
            )}
            {importNote.unknown.length > 0 && (
              <p className="mt-1 text-ink-muted">
                Not in the current bond list (check the issue code):{' '}
                <span className="num">{importNote.unknown.join(', ')}</span>
              </p>
            )}
          </div>
          <button onClick={() => setImportNote(null)} className="ml-auto text-xs text-ink-faint hover:text-ink">
            Dismiss
          </button>
        </div>
      )}

      {enriched.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-sm text-ink-soft">
            No holdings yet — and you probably already have the file this page needs.
          </p>
          {/* The DhowCSD path leads. Every Kenyan bondholder holds through
              DhowCSD, and its "Export portfolio" file imports here directly —
              the empty state used to teach only the hand-typed template while
              the importer for the file people actually have shipped unmentioned. */}
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-mint-600/40 bg-mint-500/10 p-4 text-left">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mint-700">
              Fastest: your DhowCSD export
            </p>
            <p className="text-sm leading-relaxed text-ink-soft">
              In the DhowCSD app or portal, choose <strong>Export portfolio</strong> and import
              the file here unchanged. Your holdings, face values and maturities load in one
              step — coupon amounts and the payment calendar are computed from them. Everything
              stays on this device.
            </p>
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            Or type a CSV by hand — this also lets you record what you paid, which unlocks
            yield-on-cost:
          </p>
          <div className="mx-auto mt-2 max-w-md overflow-x-auto rounded-xl border border-sand-300 bg-sand-200 p-3 text-left">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Example file
            </p>
            <pre className="num whitespace-pre text-[11px] leading-relaxed text-ink-soft">
{`issueCode,faceValueKES,purchaseDate,purchaseCleanPrice
FXD1/2022/10,1000000,2026-07-13,100
IFB1/2022/19,500000,2026-02-16,98.5`}
            </pre>
          </div>
          <button
            onClick={downloadTemplate}
            className="mt-3 inline-flex min-h-11 items-center text-xs text-gold-700 underline-offset-2 hover:underline"
          >
            Download this as a template
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="mb-1 font-semibold text-ink">Portfolio Views</h2>
                <p className="text-xs text-ink-muted">
                  Switch between waterfall, calendar, and the detailed holdings list.
                </p>
              </div>
              <div className="flex rounded-xl border border-sand-300 bg-sand-50 p-1">
                {([
                  ['waterfall', 'Waterfall'],
                  ['calendar', 'Calendar'],
                  ['list', 'List'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPortfolioView(value)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${
                      portfolioView === value ? 'bg-ink text-sand-50' : 'text-ink-soft'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="mb-1 font-semibold text-ink">Risk Metrics</h2>
                <p className="text-xs text-ink-muted">
                  Duration and convexity from after-tax cash flows, using Actual/365 timing.
                </p>
              </div>
              <button
                onClick={() => setShowRiskMetrics((open) => !open)}
                className="rounded-xl border border-sand-400 px-3 py-2 text-sm font-medium text-ink-soft hover:border-ink-muted"
              >
                {showRiskMetrics ? 'Hide' : 'Show'}
              </button>
            </div>

            {showRiskMetrics && (
              risk.rows.length > 0 ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-sand-50 p-4">
                      <p className="text-xs text-ink-muted">Weighted Macaulay duration</p>
                      <p className="num mt-1 text-xl font-bold text-ink">{risk.weightedMacaulay.toFixed(2)} yrs</p>
                    </div>
                    <div className="rounded-2xl bg-sand-50 p-4">
                      <p className="text-xs text-ink-muted">Weighted modified duration</p>
                      <p className="num mt-1 text-xl font-bold text-gold-700">{risk.weightedModified.toFixed(2)} yrs</p>
                    </div>
                    <div className="rounded-2xl bg-sand-50 p-4">
                      <p className="text-xs text-ink-muted">Portfolio convexity</p>
                      <p className="num mt-1 text-xl font-bold text-mint-700">{risk.portfolioConvexity.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="overflow-x-auto rounded-2xl border border-sand-300">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                            <th className="px-4 py-3">Yield move</th>
                            <th className="px-4 py-3 text-right">Value change</th>
                            <th className="px-4 py-3 text-right">% change</th>
                            <th className="px-4 py-3 text-right">Estimated value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {risk.scenarios.map(({ yieldChange, impact }) => (
                            <tr key={yieldChange} className="border-b border-sand-300/60 last:border-0">
                              <td className="num px-4 py-3 text-ink">
                                {yieldChange > 0 ? '+' : ''}{Math.round(yieldChange * 100)}bp
                              </td>
                              <td className={`num px-4 py-3 text-right ${impact.priceChange <= 0 ? 'text-ink-soft' : 'text-mint-700'}`}>
                                {formatKES(impact.priceChange)}
                              </td>
                              <td className="num px-4 py-3 text-right text-ink-soft">
                                {formatPct(impact.percentChange)}
                              </td>
                              <td className="num px-4 py-3 text-right text-ink">
                                {formatKES(impact.estimatedPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-ink">Individual bond durations</h3>
                      <div className="h-64">
                        <RiskMetricsDurationChart data={risk.chartData} />
                      </div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-ink-faint">
                    Based on today&apos;s recorded or resolved bond price where available, otherwise the known purchase price.
                    {risk.excluded > 0 && (
                      <> <span className="num">{risk.excluded}</span> holding{risk.excluded === 1 ? '' : 's'} excluded because no usable price or future cash flows were available.</>
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-soft">
                  Add holdings with a usable price to see duration, convexity, and rate-shock impacts.
                </p>
              )
            )}
          </div>

          {portfolioView === 'waterfall' && (
            <CashFlowWaterfall
              data={waterfallData}
              months={waterfallMonths}
              onMonthsChange={setWaterfallMonths}
              reinvestmentRate={Math.min(effectiveReinvestmentRate, maxReinvestmentRate || effectiveReinvestmentRate)}
              onReinvestmentRateChange={setReinvestmentRate}
              maxReinvestmentRate={maxReinvestmentRate}
            />
          )}

          {portfolioView === 'calendar' && (
            <CouponCalendarHeatmap events={paymentSchedule} />
          )}

          {portfolioView === 'list' && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Bond</th>
                    <th className="px-4 py-3 text-right">Face value</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Net yield<span className="ml-1 font-normal normal-case text-ink-faint">(locked)</span></th>
                    <th className="px-4 py-3 text-right">At market</th>
                    <th className="px-4 py-3 text-right">Next coupon</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {enriched.map(({ holding, bond, result, market, nextCoupon }) => (
                    <tr key={holding.id} className="border-b border-sand-300/60 last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{holding.issueCode}</span>
                        {!bond && <span className="ml-2 text-xs text-gold-700">unknown bond</span>}
                        {risk.byHoldingId.get(holding.id) && (
                          <div className="mt-1">
                            <span className="inline-flex rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-semibold text-gold-800">
                              Sensitivity: {risk.byHoldingId.get(holding.id)!.modifiedDuration.toFixed(2)} yrs
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right text-ink">{formatKES(holding.faceValueKES)}</td>
                      <td className="num px-4 py-3 text-right text-ink-soft">
                        {holding.costBasisKnown === false ? (
                          <span className="text-ink-faint" title="Not in the custody export">
                            not stated
                          </span>
                        ) : (
                          holding.purchaseCleanPrice.toFixed(2)
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right text-gold-700">
                        {holding.costBasisKnown === false ? (
                          <span className="text-ink-faint">—</span>
                        ) : result ? (
                          formatPct(result.netYTM)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right">
                        {market ? (
                          <span className={
                            holding.costBasisKnown === false
                              ? 'text-ink-soft'
                              : market.netYTM >= (result?.netYTM ?? 0)
                                ? 'text-mint-700'
                                : 'text-ink-muted'
                          }>
                            {formatPct(market.netYTM)}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right text-ink-soft">
                        {nextCoupon ? (() => {
                          const pay = paymentDay(nextCoupon.toISOString().slice(0, 10));
                          return pay.reason ? (
                            <span title={`Scheduled ${pay.scheduled} — ${pay.reason}`}>
                              {pay.paid}
                              <span className="ml-1 text-gold-700" aria-hidden="true">*</span>
                              <span className="sr-only"> (moved from {pay.scheduled}: {pay.reason})</span>
                            </span>
                          ) : (
                            <>{pay.paid}</>
                          );
                        })() : '—'}
                      </td>
                      <td className="px-2 py-3">
                        <button onClick={() => removeHolding(holding.id)} className="p-1 text-ink-faint hover:text-red-400">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-sand-300 px-4 py-3 text-xs text-ink-faint">
                Next coupon is the day the money can move.{' '}
                <span className="text-gold-700">*</span> marks a date shifted because the
                scheduled day is a weekend or a Kenyan public holiday — hover for the
                scheduled date. Yields and accrued interest are computed from the scheduled
                dates, as the prospectus does.
              </p>
            </div>
          )}

          <IncomeStabilityDashboard />

          <button onClick={clear} className="text-xs text-ink-faint underline-offset-2 hover:text-red-400 hover:underline">
            Clear all holdings
          </button>
        </>
      )}
    </div>
  );
}
