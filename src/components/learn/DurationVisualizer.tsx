'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

function bondMetrics(couponPct: number, yieldPct: number, maturityYears: number) {
  const periods = maturityYears * 2;
  const periodRate = yieldPct / 100 / 2;
  const couponPerPeriod = (couponPct / 100) * 100 / 2;

  let price = 0;
  let weightedPv = 0;

  for (let period = 1; period <= periods; period += 1) {
    const timeYears = period / 2;
    const cashFlow = period === periods ? couponPerPeriod + 100 : couponPerPeriod;
    const pv = cashFlow / (1 + periodRate) ** period;
    price += pv;
    weightedPv += timeYears * pv;
  }

  return {
    price,
    duration: weightedPv / price,
  };
}

function sensitivityTone(duration: number) {
  if (duration < 5) return 'bg-mint-600';
  if (duration < 10) return 'bg-gold-600';
  return 'bg-red-500';
}

export default function DurationVisualizer() {
  const [coupon, setCoupon] = useState(12);
  const [yieldRate, setYieldRate] = useState(13);
  const [maturity, setMaturity] = useState(10);
  const [coupon2, setCoupon2] = useState(8);
  const [yieldRate2, setYieldRate2] = useState(13);
  const [maturity2, setMaturity2] = useState(5);

  const bondA = useMemo(() => bondMetrics(coupon, yieldRate, maturity), [coupon, yieldRate, maturity]);
  const bondB = useMemo(
    () => bondMetrics(coupon2, yieldRate2, maturity2),
    [coupon2, yieldRate2, maturity2],
  );

  return (
    <section className="card space-y-5 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Duration visualizer</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Duration is a bond&apos;s timing-weighted exposure to interest rates. It tells you, roughly, how many
          percent the price could move if yields shift by 1 percentage point.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: 'Bond A coupon', value: coupon, setValue: setCoupon, min: 0, max: 15, step: 0.1 },
          { label: 'Bond A yield', value: yieldRate, setValue: setYieldRate, min: 0, max: 20, step: 0.1 },
          { label: 'Bond A maturity', value: maturity, setValue: setMaturity, min: 1, max: 30, step: 1, suffix: ' yr' },
          { label: 'Bond B coupon', value: coupon2, setValue: setCoupon2, min: 0, max: 15, step: 0.1 },
          { label: 'Bond B yield', value: yieldRate2, setValue: setYieldRate2, min: 0, max: 20, step: 0.1 },
          { label: 'Bond B maturity', value: maturity2, setValue: setMaturity2, min: 1, max: 30, step: 1, suffix: ' yr' },
        ].map((slider) => (
          <label key={slider.label} className="rounded-2xl border border-sand-300 bg-sand-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{slider.label}</span>
              <span className="font-mono text-gold-700">
                {slider.value.toFixed(slider.step === 1 ? 0 : 1)}
                {slider.suffix ?? '%'}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={slider.value}
              onChange={(event) => slider.setValue(Number(event.target.value))}
              className="w-full accent-gold-600"
              aria-label={slider.label}
            />
          </label>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { name: 'Bond A', coupon, yieldRate, maturity, metrics: bondA },
          { name: 'Bond B', coupon: coupon2, yieldRate: yieldRate2, maturity: maturity2, metrics: bondB },
        ].map((bond) => {
          const width = Math.min((bond.metrics.duration / 30) * 100, 100);
          return (
            <article key={bond.name} className="rounded-2xl border border-sand-300 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{bond.name}</h3>
                  <p className="mt-1 text-xs text-ink-faint">
                    {bond.coupon.toFixed(1)}% coupon · {bond.yieldRate.toFixed(1)}% yield · {bond.maturity} years
                  </p>
                </div>
                <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-ink-soft">
                  Macaulay duration
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-sand-50 p-3">
                  <p className="text-xs text-ink-faint">Duration</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-ink">{bond.metrics.duration.toFixed(2)} years</p>
                </div>
                <div className="rounded-2xl bg-sand-50 p-3">
                  <p className="text-xs text-ink-faint">Price per 100</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-ink">{bond.metrics.price.toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-ink-soft">
                  <span>Visual sensitivity bar</span>
                  <span>{width.toFixed(0)}% of the 30-year scale</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-sand-200">
                  <div
                    className={cn('h-full rounded-full transition-all', sensitivityTone(bond.metrics.duration))}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>

              <p className="mt-4 rounded-2xl border border-sand-300 bg-sand-50 p-3 text-sm leading-relaxed text-ink-soft">
                A 1% rise in yields will change this bond&apos;s price by approximately{' '}
                <span className="font-semibold text-ink">{bond.metrics.duration.toFixed(2)}%</span> in the opposite direction.
              </p>
            </article>
          );
        })}
      </div>

      <div className="rounded-2xl border border-mint-600/30 bg-mint-500/10 p-4 text-sm leading-relaxed text-ink-soft">
        <span className="font-semibold text-ink">High coupon bonds are less sensitive to rate changes.</span>{' '}
        Bigger coupons return more cash earlier, which pulls the average cash-flow timing forward and shortens duration.
      </div>
    </section>
  );
}
