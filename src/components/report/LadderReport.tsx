'use client';

import { formatKES, formatPct } from '@/lib/financial-engine';
import type { LadderPlan } from '@/lib/ladder';

/**
 * Print-only one-page report sheet. Hidden on screen; `window.print()` reveals
 * it (see .print-only in globals.css) so users can "Save as PDF" and share.
 */
export default function LadderReport({
  plan,
  horizon,
  generatedAt,
}: {
  plan: LadderPlan;
  horizon: number;
  generatedAt: string;
}) {
  if (!plan.rungs.length) return null;
  const maxYear = Math.max(...plan.yearlyPayouts.map((p) => p.couponsKES + p.principalKES), 1);

  return (
    <div className="print-only text-ink">
      <header className="flex items-start justify-between border-b-2 border-gold-500 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-12 w-12 rounded-lg" />
          <div>
            <p className="font-display text-xl font-bold">
              Mwangaza <span className="text-gold-600">Yield</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest text-ink-faint">
              Intelligence layer for Kenya&apos;s bond market
            </p>
          </div>
        </div>
        <div className="text-right text-[10px] text-ink-faint">
          <p>Bond Ladder Plan</p>
          <p>{generatedAt}</p>
        </div>
      </header>

      {/*
        h2, not h1, even though this reads as the title of the exported document.
        The report is rendered off-screen inside /ladder/, which already has its
        own h1, so an h1 here gave that page two — and a screen-reader user
        landing on it heard a currency figure announced as the page's subject.
        The PDF is rasterised from the styles rather than the tags, so the export
        looks identical either way; the level is doing semantic work only, and
        the page it lives in is what decides it.
      */}
      <h2 className="mt-5 font-display text-2xl font-bold">
        {formatKES(plan.totalCostKES)} over {horizon} years
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        A staggered portfolio of Kenyan government bonds, stated net of withholding tax.
        {/* This sheet is the thing someone prints and carries to a broker, so
            the price basis has to survive leaving the screen. A report that
            says only "priced at last traded levels" is a false claim when
            most rungs are sitting on the par placeholder. */}
        {plan.priceCoverage.parFallback > 0
          ? ` ${plan.priceCoverage.parFallback} of ${plan.priceCoverage.total} rungs are priced at par 100 — a placeholder, not the market — so the yields shown are indicative only.`
          : ' Priced from recorded market prices.'}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Blended net yield', value: formatPct(plan.blendedNetYTM), accent: 'text-gold-700' },
          { label: 'Net income / year', value: formatKES(plan.netAnnualIncomeKES), accent: 'text-mint-700' },
          { label: 'Total settlement cost', value: formatKES(plan.totalCostKES), accent: 'text-ink' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-sand-300 p-3">
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">{s.label}</p>
            <p className={`num mt-1 text-lg font-bold ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-6 font-display text-sm font-bold uppercase tracking-wider text-ink-soft">
        Ladder rungs
      </h2>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="border-b border-sand-300 text-left text-[10px] uppercase tracking-wide text-ink-faint">
            <th className="py-1.5">Bond</th>
            <th className="py-1.5 text-right">Face value</th>
            <th className="py-1.5 text-right">Price</th>
            <th className="py-1.5 text-right">Net yield</th>
            <th className="py-1.5 text-right">Matures</th>
          </tr>
        </thead>
        <tbody>
          {plan.rungs.map((r) => (
            <tr key={r.bond.isin} className="border-b border-sand-200">
              <td className="py-1.5 font-medium">
                {r.bond.issueCode}
                {r.bond.taxExempt && <span className="ml-1.5 text-[9px] font-bold text-mint-700">TAX-FREE</span>}
              </td>
              <td className="num py-1.5 text-right">{formatKES(r.faceValueKES)}</td>
              <td className="num py-1.5 text-right">{r.price.toFixed(2)}</td>
              <td className="num py-1.5 text-right font-semibold text-gold-700">{formatPct(r.result.netYTM)}</td>
              <td className="num py-1.5 text-right">{r.bond.maturityDate}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-6 font-display text-sm font-bold uppercase tracking-wider text-ink-soft">
        Net cash by year
      </h2>
      <div className="mt-2 flex items-end gap-1.5">
        {plan.yearlyPayouts.map((p) => {
          const total = p.couponsKES + p.principalKES;
          return (
            <div key={p.year} className="flex flex-1 flex-col items-center gap-1">
              <span className="num text-[8px] text-ink-soft">
                {total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${Math.round(total / 1000)}k`}
              </span>
              <div className="flex h-16 w-full flex-col-reverse rounded bg-sand-200">
                <div className="w-full rounded-b bg-gold-500" style={{ height: `${(p.couponsKES / maxYear) * 100}%` }} />
                <div className="w-full rounded-t bg-mint-600" style={{ height: `${(p.principalKES / maxYear) * 100}%` }} />
              </div>
              <span className="num text-[8px] text-ink-muted">{p.year}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[9px] text-ink-faint">
        Gold: net coupons received. Emerald: principal returned at maturity.
      </p>

      <footer className="mt-6 border-t border-sand-300 pt-3 text-[9px] leading-relaxed text-ink-faint">
        Yields are solved from the stated price on each bond&apos;s remaining cash-flow schedule;
        withholding tax is applied to coupons only (infrastructure bonds are exempt), principal
        redemption untaxed. Accrued interest uses Actual/364 and coupon dates run in exact 182-day
        steps from issue, the basis Kenyan government bonds are built on. Analytics for education
        only, not investment advice. Sources: Central Bank of Kenya, NSE, KNBS.
      </footer>
    </div>
  );
}
