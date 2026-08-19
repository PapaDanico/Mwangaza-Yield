'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inputCls } from '@/lib/field-styles';
import { cn } from '@/lib/utils';

const FACE_VALUE = 250000;
const COUPON_RATE = 12;
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);

const formatKES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

export default function LadderingDemo() {
  const [maturities, setMaturities] = useState([1, 3, 5, 7]);
  const [targetIncome, setTargetIncome] = useState(120000);

  const annualCoupon = (FACE_VALUE * COUPON_RATE) / 100;
  const horizon = Math.max(...maturities);

  const chartData = useMemo(
    () =>
      YEAR_OPTIONS.filter((year) => year <= horizon).map((year) => {
        const cashFlow = maturities.reduce((total, maturity) => {
          if (year > maturity) return total;
          const coupon = annualCoupon;
          const principal = year === maturity ? FACE_VALUE : 0;
          return total + coupon + principal;
        }, 0);

        return {
          year: `Year ${year}`,
          cashFlow,
        };
      }),
    [annualCoupon, horizon, maturities],
  );

  const allYearsMeetTarget = chartData.every((row) => row.cashFlow >= targetIncome);
  const totalPortfolioValue = maturities.length * FACE_VALUE;
  const blendedYield = (annualCoupon * maturities.length / totalPortfolioValue) * 100;

  return (
    <section className="card space-y-5 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Laddering demo</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          A ladder spreads maturities across time so some money returns regularly while coupons keep paying along the way.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {maturities.map((maturity, index) => (
          <article key={`bond-${index + 1}`} className="rounded-2xl border border-sand-300 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">Bond {index + 1}</h3>
              <span className="rounded-full bg-sand-100 px-2 py-1 text-xs text-ink-soft">KES 250,000</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">12% coupon · annual coupon {formatKES.format(annualCoupon)}</p>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-medium text-ink">Maturity year</span>
              <select
                value={maturity}
                onChange={(event) => {
                  const next = [...maturities];
                  next[index] = Number(event.target.value);
                  setMaturities(next);
                }}
                className={inputCls}
              >
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    Year {year}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>

      <label className="block rounded-2xl border border-sand-300 bg-sand-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink">Target annual income</span>
          <span className="font-mono text-gold-700">{formatKES.format(targetIncome)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={200000}
          step={5000}
          value={targetIncome}
          onChange={(event) => setTargetIncome(Number(event.target.value))}
          className="w-full accent-gold-600"
          aria-label="Target annual income"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-sand-300 bg-white p-4">
          <p className="text-xs text-ink-faint">Total portfolio value</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-ink">{formatKES.format(totalPortfolioValue)}</p>
        </div>
        <div className="rounded-2xl border border-sand-300 bg-white p-4">
          <p className="text-xs text-ink-faint">Blended yield</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-ink">{blendedYield.toFixed(2)}%</p>
        </div>
      </div>

      <div className="h-80 rounded-2xl border border-sand-300 bg-white/70 p-2 sm:p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#D9CBB3" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fill: '#526070', fontSize: 12 }} />
            <YAxis tick={{ fill: '#526070', fontSize: 12 }} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
            <Tooltip formatter={(value: number) => [formatKES.format(value), 'Cash flow']} />
            <ReferenceLine y={targetIncome} stroke="#0F172A" strokeDasharray="6 4" label={{ value: 'Target', fill: '#0F172A', fontSize: 12 }} />
            <Bar dataKey="cashFlow" radius={[10, 10, 0, 0]}>
              {chartData.map((row) => (
                <Cell key={row.year} fill={row.cashFlow >= targetIncome ? '#047857' : '#DC2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-sand-300 bg-sand-50 p-4 text-sm leading-relaxed text-ink-soft">
        Each bar includes annual coupons from bonds still alive, plus principal when a bond matures. Green bars meet your target; red bars show a year where income may need support from cash reserves or reinvestment.
      </div>

      {allYearsMeetTarget && (
        <div className={cn('rounded-2xl border border-mint-600/30 bg-mint-500/10 p-4 text-sm leading-relaxed text-ink-soft')}>
          <span className="font-semibold text-ink">Smooth your income.</span>{' '}
          Every year in this ladder currently meets your target, which is the main reason investors spread maturities instead of buying one big bullet bond.
        </div>
      )}
    </section>
  );
}
