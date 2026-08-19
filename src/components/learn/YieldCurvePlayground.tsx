'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

const COUPON_RATE = 12;

const formatKES = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

function bondPrice(years: number, yieldPct: number) {
  const r = yieldPct / 100;
  const coupon = COUPON_RATE;
  return (coupon / r) * (1 - (1 + r) ** -years) + 100 / (1 + r) ** years;
}

export default function YieldCurvePlayground() {
  const [y1, setY1] = useState(9);
  const [y5, setY5] = useState(11);
  const [y10, setY10] = useState(13);
  const [y20, setY20] = useState(14);

  const curve = useMemo(
    () =>
      [
        { tenor: '1Y', years: 1, yield: y1 },
        { tenor: '5Y', years: 5, yield: y5 },
        { tenor: '10Y', years: 10, yield: y10 },
        { tenor: '20Y', years: 20, yield: y20 },
      ],
    [y1, y5, y10, y20],
  );

  const prices = useMemo(
    () => [
      { tenor: 1, yield: y1, price: bondPrice(1, y1) },
      { tenor: 5, yield: y5, price: bondPrice(5, y5) },
      { tenor: 10, yield: y10, price: bondPrice(10, y10) },
      { tenor: 20, yield: y20, price: bondPrice(20, y20) },
    ],
    [y1, y5, y10, y20],
  );

  const forwardRate = useMemo(() => (((1 + y5 / 100) ** 5 / (1 + y1 / 100)) ** 0.25 - 1) * 100, [y1, y5]);

  return (
    <section className="card space-y-5 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Yield curve playground</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Move each point on the curve and watch how the same 12% coupon bond behaves at different
          maturities. Longer bonds feel rate changes for longer, so their prices usually move more.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: '1-year yield', value: y1, setValue: setY1 },
          { label: '5-year yield', value: y5, setValue: setY5 },
          { label: '10-year yield', value: y10, setValue: setY10 },
          { label: '20-year yield', value: y20, setValue: setY20 },
        ].map((slider) => (
          <label key={slider.label} className="rounded-2xl border border-sand-300 bg-sand-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink">slider.label</span>
              <span className="font-mono text-gold-700">{slider.value.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={6}
              max={20}
              step={0.1}
              value={slider.value}
              onChange={(event) => slider.setValue(Number(event.target.value))}
              className="w-full accent-gold-600"
              aria-label={slider.label}
            />
          </label>
        ))}
      </div>

      <div className="h-72 rounded-2xl border border-sand-300 bg-white/70 p-2 sm:p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#D9CBB3" strokeDasharray="3 3" />
            <XAxis dataKey="tenor" tick={{ fill: '#526070', fontSize: 12 }} />
            <YAxis
              tick={{ fill: '#526070', fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
              domain={[6, 20]}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, 'Yield']}
              labelFormatter={(label) => `${label} point`}
              contentStyle={{ borderRadius: 16, borderColor: '#D9CBB3', backgroundColor: '#FFF9ED' }}
            />
            <Line
              type="monotone"
              dataKey="yield"
              stroke="#B45309"
              strokeWidth={3}
              dot={{ r: 5, fill: '#B45309' }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-sand-300 bg-sand-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
          What the curve implies
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The 1Y-to-5Y forward rate is <span className="font-semibold text-ink">{forwardRate.toFixed(2)}%</span>.
          That is the market&apos;s rough implied annual rate for years 2 to 5 if today&apos;s curve held steady.
        </p>
      </div>

      {y20 > 15 && (
        <div className="rounded-2xl border border-gold-400 bg-gold-50 p-4 text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">See how rising long-term rates hurt long bonds more?</span>{' '}
          When the 20-year yield climbs above 15%, the long bond&apos;s discount rate bites into many years
          of future cash flows, so its price falls fastest.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-sand-300">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand-100 text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">Tenor</th>
              <th className="px-3 py-2 font-semibold">Yield</th>
              <th className="px-3 py-2 font-semibold">Price per 100</th>
              <th className="px-3 py-2 font-semibold">Reading</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((row) => {
              const premium = row.price >= 100;
              return (
                <tr key={row.tenor} className="border-t border-sand-300 bg-white text-ink">
                  <td className="px-3 py-2">{row.tenor} year</td>
                  <td className="px-3 py-2 font-mono">{row.yield.toFixed(1)}%</td>
                  <td className="px-3 py-2 font-mono">{row.price.toFixed(2)}</td>
                  <td className={cn('px-3 py-2 text-xs', premium ? 'text-mint-700' : 'text-gold-800')}>
                    {premium
                      ? 'Above par: the coupon is richer than the required yield.'
                      : 'Below par: investors now demand more yield than the coupon offers.'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        Example scale: a price of 95 means about {formatKES.format(950000)} for Ksh 1,000,000 face value.
        The math is simplified, but the lesson is real: curve shape matters because discounting compounds over time.
      </p>
    </section>
  );
}
