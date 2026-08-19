'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AuctionPrint, Bond } from '@/types/bond';
import { computeBondInvestment, formatKES, getCouponDates } from '@/lib/financial-engine';
import { computeBondRiskMetrics, computePriceSensitivity } from '@/lib/riskMetrics';
import { db } from '@/lib/db';
import { useBondStore } from '@/stores/bondStore';

export default function BondDetailCard({
  bond,
  related,
  prints,
  open,
  onClose,
  onAddToPortfolio,
  onCalculate,
  onSetGoal,
}: {
  bond: Bond | null;
  related: Bond[];
  prints: AuctionPrint[];
  open: boolean;
  onClose: () => void;
  onAddToPortfolio?: (bond: Bond) => void;
  onCalculate?: (bond: Bond) => void;
  onSetGoal?: (bond: Bond) => void;
}) {
  const [yieldThreshold, setYieldThreshold] = useState<number>(bond?.ytmGross ?? 0);
  const [compare, setCompare] = useState<string[]>([]);
  const cpi = useBondStore((s) =>
    [...s.macro]
      .filter((m) => m.indicator === 'CPI')
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? 0,
  );

  useEffect(() => {
    setYieldThreshold(bond?.ytmGross ?? 0);
  }, [bond]);

  const cmpBonds = useMemo(() => related.filter((b) => compare.includes(b.isin)).slice(0, 3), [compare, related]);

  if (!open || !bond) return null;

  const asOf = new Date();
  const invPar = computeBondInvestment(bond, 100000, 100, asOf);
  const inv95 = computeBondInvestment(bond, 100000, 95, asOf);
  const inv105 = computeBondInvestment(bond, 100000, 105, asOf);

  const risk = computeBondRiskMetrics(bond, 100000, invPar.netYTM, asOf);
  const shifts = [-5, -2, -1, 1, 2, 5].map((d) => computePriceSensitivity(risk.modifiedDuration, risk.convexity, d, 100));

  const history = prints
    .filter((p) => p.issueCode === bond.issueCode)
    .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate))
    .map((p) => ({ date: p.auctionDate.slice(2, 10), y: p.weightedAverageRate ?? p.marketWeightedAverageRate ?? p.pricePer100 ?? null }))
    .filter((x) => x.y != null);

  const coupons = getCouponDates(new Date(bond.issueDate), new Date(bond.maturityDate), bond.couponFrequencyPerYear || 2)
    .filter((d) => d > new Date())
    .slice(0, 24)
    .map((d) => ({
      date: d.toISOString().slice(0, 10),
      coupon: (100000 * bond.couponRate) / 100 / (bond.couponFrequencyPerYear || 2),
      principal: d.toISOString().slice(0, 10) === bond.maturityDate ? 100000 : 0,
    }));

  const saveReopenAlert = async () => {
    await db.bondAlerts.put({ id: `reopen-${bond.isin}`, isin: bond.isin, kind: 'reopen', createdAt: new Date().toISOString() });
  };

  const saveYieldAlert = async () => {
    await db.bondAlerts.put({
      id: `yield-${bond.isin}`,
      isin: bond.isin,
      kind: 'yield-threshold',
      threshold: yieldThreshold,
      createdAt: new Date().toISOString(),
    });
  };

  const yearsRemaining = Math.max(0, (new Date(bond.maturityDate).getTime() - Date.now()) / (365.25 * 86_400_000));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30">
      <div className="h-full w-full max-w-3xl overflow-y-auto border-l-2 border-ink bg-sand-50 p-4 sm:p-5">
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between border-b border-sand-300 bg-sand-50 px-4 py-3 sm:-mx-5 sm:px-5">
          <div>
            <h2 className="font-semibold text-ink">{bond.name}</h2>
            <p className="text-xs text-ink-muted">{bond.isin}</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-gold-500/20 p-1.5 text-gold-700 hover:bg-gold-500/30"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          <section className="card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${bond.taxExempt ? 'bg-mint-500/15 text-mint-700' : 'bg-ink/10 text-ink'}`}>{bond.taxExempt ? 'IFB' : 'Taxable'}</span>
              <span className="rounded-full bg-sand-200 px-2 py-0.5 text-ink-soft">{new Date(bond.maturityDate) < new Date() ? 'Matured' : 'On Offer'}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <p className="text-sm">Coupon <span className="num font-semibold">{bond.couponRate.toFixed(2)}%</span></p>
              <p className="text-sm">Maturity <span className="num font-semibold">{bond.maturityDate}</span></p>
              <p className="text-sm">Years remaining <span className="num font-semibold">{yearsRemaining.toFixed(1)}</span></p>
              <p className="text-sm">Issue date <span className="num font-semibold">{bond.issueDate}</span></p>
              <p className="text-sm">Min ticket <span className="num font-semibold">{formatKES(bond.minInvestmentKES)}</span></p>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="font-semibold text-ink">Yield Analytics</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <p>Net yield (par): <span className="num font-semibold">{invPar.netYTM.toFixed(2)}%</span></p>
              <p>Real yield: <span className="num font-semibold">{(invPar.netYTM - cpi).toFixed(2)}%</span></p>
              <p>YTM @95: <span className="num font-semibold">{inv95.netYTM.toFixed(2)}%</span></p>
              <p>YTM @105: <span className="num font-semibold">{inv105.netYTM.toFixed(2)}%</span></p>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="font-semibold text-ink">Auction History</h3>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Line dataKey="y" stroke="#0B214A" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="font-semibold text-ink">Cash Flow Schedule</h3>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-ink-faint"><th>Date</th><th className="text-right">Coupon</th><th className="text-right">Principal</th></tr></thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.date} className="border-t border-sand-200">
                      <td className="py-1.5">{c.date}</td>
                      <td className="num py-1.5 text-right">{formatKES(c.coupon)}</td>
                      <td className="num py-1.5 text-right">{c.principal ? formatKES(c.principal) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-4">
            <h3 className="font-semibold text-ink">Price Sensitivity</h3>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-faint"><th>Yield shift</th><th className="text-right">Estimated price</th></tr></thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.yieldChange} className="border-t border-sand-200">
                    <td className="py-1.5">{s.yieldChange > 0 ? '+' : ''}{s.yieldChange}%</td>
                    <td className="num py-1.5 text-right">{s.estimatedPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4">
            <h3 className="font-semibold text-ink">Related Bonds</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {related.slice(0, 6).map((b) => (
                <button
                  key={b.isin}
                  onClick={() => setCompare((prev) => prev.includes(b.isin) ? prev.filter((x) => x !== b.isin) : [...prev, b.isin].slice(0, 3))}
                  className={`rounded-lg border px-2 py-1 text-xs ${compare.includes(b.isin) ? 'border-gold-600 bg-gold-100 text-gold-800' : 'border-sand-300'}`}
                >
                  {b.issueCode}
                </button>
              ))}
            </div>

            {cmpBonds.length > 0 && (
              <div className="mt-3 overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-ink-faint"><th>Bond</th><th className="text-right">Coupon</th><th className="text-right">Yield</th><th className="text-right">Maturity</th><th className="text-right">Tax</th></tr></thead>
                  <tbody>
                    {[bond, ...cmpBonds].slice(0, 4).map((b) => (
                      <tr key={b.isin} className="border-t border-sand-200">
                        <td className="py-1.5">{b.issueCode}</td>
                        <td className="num py-1.5 text-right">{b.couponRate.toFixed(2)}%</td>
                        <td className="num py-1.5 text-right">{b.ytmGross.toFixed(2)}%</td>
                        <td className="num py-1.5 text-right">{b.maturityDate}</td>
                        <td className="py-1.5 text-right">{b.taxExempt ? 'Tax-free' : 'Taxable'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-ink-faint">Winner: highest net yield and tax efficiency for current profile.</p>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h3 className="font-semibold text-ink">Bond Alerts</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={saveReopenAlert} className="rounded-lg border border-sand-300 px-3 py-1 text-xs hover:bg-sand-100">Notify me when this bond reopens</button>
              <div className="flex items-center gap-2 text-xs">
                <span>Notify me when yield exceeds</span>
                <input type="number" step="0.1" value={yieldThreshold} onChange={(e) => setYieldThreshold(Number(e.target.value) || 0)} className="num w-16 rounded border border-sand-300 px-1 py-0.5" />
                <button onClick={saveYieldAlert} className="rounded-lg border border-sand-300 px-2 py-1 hover:bg-sand-100">Save</button>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => onAddToPortfolio?.(bond)} className="rounded-xl border border-sand-300 px-3 py-2 text-sm hover:bg-sand-100">Add to Portfolio</button>
            <button onClick={() => onCalculate?.(bond)} className="rounded-xl border border-sand-300 px-3 py-2 text-sm hover:bg-sand-100">Calculate with this bond</button>
            <button onClick={() => onSetGoal?.(bond)} className="rounded-xl border border-sand-300 px-3 py-2 text-sm hover:bg-sand-100">Set Goal using this</button>
          </div>
        </div>
      </div>
    </div>
  );
}
