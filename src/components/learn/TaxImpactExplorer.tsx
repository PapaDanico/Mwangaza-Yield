'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { inputCls } from '@/lib/field-styles';
import { cn } from '@/lib/utils';

type BondType = 'IFB' | 'FXD-short' | 'FXD-long';

const TAX_RATES: Record<BondType, number> = {
  IFB: 0,
  'FXD-short': 0.15,
  'FXD-long': 0.1,
};

const LABELS: Record<BondType, string> = {
  IFB: 'Infrastructure bond (tax-free)',
  'FXD-short': 'FXD bond under 10 years',
  'FXD-long': 'FXD bond 10 years or longer',
};

const formatKES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export default function TaxImpactExplorer() {
  const [amount, setAmount] = useState(1_000_000);
  const [bondType, setBondType] = useState<BondType>('IFB');
  const [coupon, setCoupon] = useState(12);

  const taxRate = TAX_RATES[bondType];

  const metrics = useMemo(() => {
    const grossAnnual = (amount * coupon) / 100;
    const tax = grossAnnual * taxRate;
    const net = grossAnnual - tax;
    const breakEvenIFBRate = coupon * (1 - taxRate);
    const hypotheticalIfbCoupon = Math.max(coupon - 2, 0);
    const hypotheticalIfbNet = (amount * hypotheticalIfbCoupon) / 100;
    const taxAdvantageVsShortFxd = Math.max(grossAnnual * 0.15 - tax, 0);

    return {
      grossAnnual,
      tax,
      net,
      breakEvenIFBRate,
      hypotheticalIfbCoupon,
      hypotheticalIfbNet,
      taxAdvantageVsShortFxd,
    };
  }, [amount, coupon, taxRate]);

  const pieData = useMemo(
    () => [
      { name: 'You keep', value: metrics.net, color: '#047857' },
      { name: 'Withholding tax', value: metrics.tax, color: '#DC2626' },
      { name: 'Tax saved vs 15% FXD', value: metrics.taxAdvantageVsShortFxd, color: '#B45309' },
    ],
    [metrics.net, metrics.tax, metrics.taxAdvantageVsShortFxd],
  );

  const taxableBeatsLowerIfb = bondType !== 'IFB' && metrics.net > metrics.hypotheticalIfbNet;

  return (
    <section className="card space-y-5 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Tax impact explorer</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Coupon rate is only the starting point. What matters in your pocket is the after-tax income you keep.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <label className="block rounded-2xl border border-sand-300 bg-sand-50 p-3">
            <span className="mb-2 block text-sm font-medium text-ink">Face value invested</span>
            <input
              type="range"
              min={100000}
              max={5000000}
              step={50000}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="w-full accent-gold-600"
              aria-label="Face value invested"
            />
            <span className="mt-2 block font-mono text-sm text-gold-700">{formatKES.format(amount)}</span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ink">Bond type</span>
            <select value={bondType} onChange={(event) => setBondType(event.target.value as BondType)} className={inputCls}>
              <option value="IFB">{LABELS.IFB}</option>
              <option value="FXD-short">{LABELS['FXD-short']}</option>
              <option value="FXD-long">{LABELS['FXD-long']}</option>
            </select>
          </label>

          <label className="block rounded-2xl border border-sand-300 bg-sand-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink">Coupon rate</span>
              <span className="font-mono text-gold-700">{coupon.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={4}
              max={18}
              step={0.1}
              value={coupon}
              onChange={(event) => setCoupon(Number(event.target.value))}
              className="w-full accent-gold-600"
              aria-label="Coupon rate"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Gross annual coupon', value: metrics.grossAnnual },
              { label: 'Withholding tax', value: metrics.tax },
              { label: 'Net income kept', value: metrics.net },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-sand-300 bg-white p-3">
                <p className="text-xs text-ink-faint">{item.label}</p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink">{formatKES.format(item.value)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-sand-300 bg-white p-3 sm:p-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  innerRadius={48}
                  paddingAngle={3}
                  label={({ name, value }) => `${name}: ${formatKES.format(Number(value))}`}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatKES.format(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Green shows income you keep, red shows tax lost, and gold shows how much more of the coupon you keep versus a 15% taxable FXD bond.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-sand-300 bg-sand-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Break-even IFB coupon</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          To match a {coupon.toFixed(1)}% {LABELS[bondType].toLowerCase()}, a tax-free IFB would only need to offer{' '}
          <span className="font-semibold text-ink">{metrics.breakEvenIFBRate.toFixed(2)}%</span>.
          That is the after-tax equivalent rate: coupon × (1 − tax rate).
        </p>
      </div>

      <div className="rounded-2xl border border-sand-300 bg-white p-4 text-sm text-ink-soft">
        <h3 className="mb-3 font-semibold text-ink">Plotted tax breakdown</h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-sand-300 text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2">Category</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-sand-300/60">
              <td className="py-2 text-ink">You keep</td>
              <td className="py-2 text-right font-mono text-ink">{formatKES.format(metrics.net)}</td>
            </tr>
            <tr className="border-b border-sand-300/60">
              <td className="py-2 text-ink">Withholding tax</td>
              <td className="py-2 text-right font-mono text-ink">{formatKES.format(metrics.tax)}</td>
            </tr>
            <tr>
              <td className="py-2 text-ink">Tax saved vs 15% FXD</td>
              <td className="py-2 text-right font-mono text-ink">{formatKES.format(metrics.taxAdvantageVsShortFxd)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {taxableBeatsLowerIfb && (
        <div className={cn('rounded-2xl border p-4 text-sm leading-relaxed', 'border-gold-400 bg-gold-50 text-ink-soft')}>
          <span className="font-semibold text-ink">Tax-free isn&apos;t always best.</span>{' '}
          A taxable bond at {coupon.toFixed(1)}% still beats an IFB at {metrics.hypotheticalIfbCoupon.toFixed(1)}% here, because its net income of{' '}
          <span className="font-semibold text-ink">{formatKES.format(metrics.net)}</span> is higher than the lower-coupon IFB&apos;s{' '}
          <span className="font-semibold text-ink">{formatKES.format(metrics.hypotheticalIfbNet)}</span>.
        </div>
      )}
    </section>
  );
}
