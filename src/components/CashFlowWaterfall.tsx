'use client';

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatKES, formatPct } from '@/lib/financial-engine';
import type { WaterfallPoint } from '@/lib/portfolioCashFlows';

const WINDOWS = [12, 24, 36, 60] as const;

export default function CashFlowWaterfall({
  data,
  months,
  onMonthsChange,
  reinvestmentRate,
  onReinvestmentRateChange,
  maxReinvestmentRate,
}: {
  data: WaterfallPoint[];
  months: number;
  onMonthsChange: (months: 12 | 24 | 36 | 60) => void;
  reinvestmentRate: number;
  onReinvestmentRateChange: (rate: number) => void;
  maxReinvestmentRate: number;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Cash Flow Waterfall</h2>
          <p className="text-xs text-ink-muted">
            Net coupon inflows in gold, principal in navy, with a reinvested running balance in emerald.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {WINDOWS.map((window) => (
            <button
              key={window}
              onClick={() => onMonthsChange(window)}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                months === window ? 'bg-ink text-sand-50' : 'border border-sand-400 text-ink-soft hover:border-ink-muted'
              }`}
            >
              {window}m
            </button>
          ))}
        </div>
      </div>

      <label className="block rounded-2xl border border-sand-300 bg-sand-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-ink">Reinvestment Rate</span>
          <span className="num text-gold-700">{formatPct(reinvestmentRate)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(maxReinvestmentRate, 0)}
          step={0.1}
          value={Math.min(reinvestmentRate, Math.max(maxReinvestmentRate, 0))}
          onChange={(event) => onReinvestmentRateChange(Number(event.target.value))}
          className="w-full accent-gold-600"
          aria-label="Reinvestment rate"
        />
        <p className="mt-2 text-xs text-ink-faint">
          Slide from 0% up to the current maximum observed net yield in your portfolio.
        </p>
      </label>

      <div className="h-80">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              tick={{ fill: '#8B8676', fontSize: 11 }}
              stroke="#CBBD9C"
            />
            <YAxis
              yAxisId="cash"
              tick={{ fill: '#8B8676', fontSize: 12 }}
              stroke="#CBBD9C"
              tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
              width={52}
            />
            <YAxis
              yAxisId="balance"
              orientation="right"
              tick={{ fill: '#8B8676', fontSize: 12 }}
              stroke="#CBBD9C"
              tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: '#FDFBF5',
                border: '1px solid #E3D8BE',
                borderRadius: 12,
                color: '#0A192F',
              }}
              formatter={(value: number, name) => [formatKES(value), name]}
            />
            <Legend
              formatter={(value) => <span style={{ color: '#31445F', fontSize: 12 }}>{value}</span>}
            />
            <Bar yAxisId="cash" dataKey="coupons" stackId="flows" name="Coupons" fill="#D4A017" radius={[6, 6, 0, 0]} />
            <Bar yAxisId="cash" dataKey="principal" stackId="flows" name="Principal" fill="#31445F" radius={[6, 6, 0, 0]} />
            <Line
              yAxisId="balance"
              type="monotone"
              dataKey="runningBalance"
              name="Running balance"
              stroke="#059669"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: '#FDFBF5', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
