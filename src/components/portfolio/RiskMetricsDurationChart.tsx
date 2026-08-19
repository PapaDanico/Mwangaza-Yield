'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface RiskDurationDatum {
  issueCode: string;
  duration: number;
}

export default function RiskMetricsDurationChart({ data }: { data: RiskDurationDatum[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
        <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="issueCode"
          angle={-25}
          height={60}
          interval={0}
          textAnchor="end"
          tick={{ fill: '#8B8676', fontSize: 11 }}
          stroke="#CBBD9C"
        />
        <YAxis
          tick={{ fill: '#8B8676', fontSize: 12 }}
          stroke="#CBBD9C"
          tickFormatter={(value) => `${Number(value).toFixed(1)}y`}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: '#FDFBF5',
            border: '1px solid #E3D8BE',
            borderRadius: 12,
            color: '#0A192F',
          }}
          formatter={(value: number) => [`${value.toFixed(2)} years`, 'Modified duration']}
        />
        <Bar dataKey="duration" fill="#D97706" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
