'use client';

import { useBondStore } from '@/stores/bondStore';

const LABELS: Record<string, string> = {
  CBR: 'Central Bank Rate',
  CPI: 'Inflation (CPI)',
  FX_USD_KES: 'USD/KES',
  GDP: 'GDP Growth',
};

export default function MacroPanel() {
  const macro = useBondStore((s) => s.macro);
  if (!macro.length) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {macro.map((m) => (
        <div key={m.id} className="card p-4">
          <p className="text-xs text-slate-400">{LABELS[m.indicator] ?? m.indicator}</p>
          <p className="num mt-1 text-xl font-bold text-white">
            {m.value}
            <span className="ml-1 text-sm font-normal text-slate-400">{m.unit}</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{m.source} · {m.date}</p>
        </div>
      ))}
    </div>
  );
}
