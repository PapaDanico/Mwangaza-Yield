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
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {macro.map((m) => (
        <div key={m.id} className="card p-3 sm:p-4">
          <p className="truncate text-[11px] text-ink-faint sm:text-xs">{LABELS[m.indicator] ?? m.indicator}</p>
          <p className="num mt-1 text-base font-bold text-ink sm:text-xl">
            {m.value}
            <span className="ml-1 text-xs font-normal text-ink-muted sm:text-sm">{m.unit}</span>
          </p>
          <p className="mt-1 hidden text-[11px] text-ink-faint sm:block">{m.source} · {m.date}</p>
        </div>
      ))}
    </div>
  );
}
