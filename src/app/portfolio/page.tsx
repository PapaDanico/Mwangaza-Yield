'use client';

import { useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, Trash2, Download } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { computeBondInvestment, formatKES, formatPct, getNextCouponDate } from '@/lib/financial-engine';
import type { Holding } from '@/types/bond';

const CSV_TEMPLATE = 'issueCode,faceValueKES,purchaseDate,purchaseCleanPrice\nFXD1/2022/10,1000000,2026-07-13,100\nIFB1/2022/19,500000,2026-02-16,100\n';

export default function PortfolioPage() {
  const bonds = useBondStore((s) => s.bonds);
  const { holdings, addHoldings, removeHolding, clear } = usePortfolioStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const enriched = useMemo(() => {
    return holdings.map((h) => {
      const bond = bonds.find((b) => b.issueCode === h.issueCode || b.isin === h.isin);
      if (!bond) return { holding: h, bond: null, result: null, nextCoupon: null };
      const result = computeBondInvestment(bond, h.faceValueKES, h.purchaseCleanPrice, new Date(h.purchaseDate));
      const nextCoupon = getNextCouponDate(bond, new Date());
      return { holding: h, bond, result, nextCoupon };
    });
  }, [holdings, bonds]);

  const totals = useMemo(() => {
    const valid = enriched.filter((e) => e.result);
    const cost = valid.reduce((s, e) => s + e.result!.settlementCostKES, 0);
    const income = valid.reduce((s, e) => s + e.result!.netAnnualIncomeKES, 0);
    const weightedNet = cost > 0
      ? valid.reduce((s, e) => s + e.result!.netYTM * e.result!.settlementCostKES, 0) / cost
      : 0;
    return { cost, income, weightedNet };
  }, [enriched]);

  // 12-month coupon calendar
  const calendar = useMemo(() => {
    const months: { label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ label: m.toLocaleString('en-KE', { month: 'short', year: '2-digit' }), total: 0 });
    }
    for (const e of enriched) {
      if (!e.bond || !e.result) continue;
      let d = getNextCouponDate(e.bond, now);
      while (d) {
        const idx = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
        if (idx >= 12) break;
        if (idx >= 0) months[idx].total += e.result.netCouponPerPeriodKES;
        const next: Date | null = getNextCouponDate(e.bond, new Date(d.getTime() + 86_400_000));
        if (!next || next.getTime() === d.getTime()) break;
        d = next;
      }
    }
    return months;
  }, [enriched]);

  function handleFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows: Holding[] = res.data
          .filter((r) => r.issueCode && r.faceValueKES)
          .map((r, i) => ({
            id: `${r.issueCode}-${r.purchaseDate ?? ''}-${i}-${r.faceValueKES}`,
            isin: bonds.find((b) => b.issueCode === r.issueCode.trim())?.isin ?? '',
            issueCode: r.issueCode.trim(),
            faceValueKES: Number(r.faceValueKES),
            purchaseDate: r.purchaseDate?.trim() || new Date().toISOString().slice(0, 10),
            purchaseCleanPrice: Number(r.purchaseCleanPrice) || 100,
          }));
        if (rows.length) addHoldings(rows);
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

  const maxMonth = Math.max(...calendar.map((m) => m.total), 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Portfolio</h1>
          <p className="text-sm text-ink-muted">Stored locally on your device — never uploaded.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 rounded-xl border border-sand-400 px-3 py-2 text-sm text-ink-soft hover:border-ink-muted">
            <Download size={15} /> CSV template
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-sand-50 hover:bg-ink-soft">
            <Upload size={15} /> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
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

      {enriched.length === 0 ? (
        <div className="card py-12 text-center text-sm text-ink-muted">
          No holdings yet. Import a CSV (columns: issueCode, faceValueKES, purchaseDate,
          purchaseCleanPrice) to see your net yields and coupon calendar.
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3">Bond</th>
                  <th className="px-4 py-3 text-right">Face value</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Net yield</th>
                  <th className="px-4 py-3 text-right">Next coupon</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {enriched.map(({ holding, bond, result, nextCoupon }) => (
                  <tr key={holding.id} className="border-b border-sand-300/60 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{holding.issueCode}</span>
                      {!bond && <span className="ml-2 text-xs text-gold-700">unknown bond</span>}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">{formatKES(holding.faceValueKES)}</td>
                    <td className="num px-4 py-3 text-right text-ink-soft">{holding.purchaseCleanPrice.toFixed(2)}</td>
                    <td className="num px-4 py-3 text-right text-gold-700">{result ? formatPct(result.netYTM) : '—'}</td>
                    <td className="num px-4 py-3 text-right text-ink-soft">{nextCoupon ? nextCoupon.toISOString().slice(0, 10) : '—'}</td>
                    <td className="px-2 py-3">
                      <button onClick={() => removeHolding(holding.id)} className="p-1 text-ink-faint hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="mb-1 font-semibold text-ink">Coupon Cash-Flow Calendar</h2>
            <p className="mb-4 text-xs text-ink-muted">Estimated net coupons over the next 12 months</p>
            <div className="grid grid-cols-6 gap-2 md:grid-cols-12">
              {calendar.map((m) => (
                <div key={m.label} className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end rounded-lg bg-sand-200 p-1">
                    <div
                      className="w-full rounded bg-gold-500"
                      style={{ height: `${(m.total / maxMonth) * 100}%`, minHeight: m.total > 0 ? 4 : 0 }}
                      title={formatKES(m.total)}
                    />
                  </div>
                  <span className="text-[10px] text-ink-muted">{m.label}</span>
                  <span className="num text-[10px] text-ink-soft">
                    {m.total > 0 ? `${Math.round(m.total / 1000)}k` : '·'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={clear} className="text-xs text-ink-faint underline-offset-2 hover:text-red-400 hover:underline">
            Clear all holdings
          </button>
        </>
      )}
    </div>
  );
}
