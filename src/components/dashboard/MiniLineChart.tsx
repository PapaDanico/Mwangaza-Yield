'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A small SVG line chart for the dashboard, replacing Recharts there.
 *
 * WHY. Profiling /dashboard/ on 4 Oct 2026 found Recharts (a 357 KB chunk) the
 * largest avoidable script cost on load — ~110 ms of execution unthrottled,
 * several times that on the mid-range Android this audience uses — spent
 * drawing two simple line charts. Deferring it until scrolled into view was
 * tried and measured as no gain (CLAUDE.md), because the charts are near the
 * top. Not loading it at all is the remaining lever. Every figure plotted
 * here is also printed as text beside the chart, so this stays an enhancement.
 */
export interface Series {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
  step?: boolean;
  /** Line width; defaults to 2.5. */
  width?: number;
  /** Dot radius; defaults to 3. */
  dot?: number;
}

interface Props<T> {
  data: T[];
  x: (d: T) => number;
  series: Series[];
  value: (d: T, key: string) => number | undefined | null;
  xLabel: (x: number) => string;
  tooltipLabel: (d: T) => string;
  referenceY?: number;
  legend?: boolean;
  height?: number;
}

const PAD = { l: 52, r: 12, t: 10, b: 24 };
const AXIS = '#8B8676';
const GRID = '#E3D8BE';

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].find((s) => span / s <= n) ?? 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4));
  return out;
}

export default function MiniLineChart<T>({
  data, x, series, value, xLabel, tooltipLabel, referenceY, legend = false, height = 256,
}: Props<T>) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the container's real pixel width, so text and dots never stretch.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = legend ? height - 40 : height;

  const geo = useMemo(() => {
    const xs = data.map(x);
    const ys = data.flatMap((d) => series.map((s) => value(d, s.key))).filter((v): v is number => v != null);
    if (referenceY != null) ys.push(referenceY);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 0.5;
    const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
    const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
    const sy = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
    return { xs, sx, sy, yTicks: niceTicks(y0, y1), y0, y1 };
  }, [data, x, series, value, referenceY, H, W]);

  if (data.length === 0) return null;
  const { xs, sx, sy, yTicks } = geo;

  const xTickIdx = (() => {
    const max = Math.max(3, Math.floor(W / 90));
    const every = Math.max(1, Math.ceil(data.length / max));
    return data.map((_, i) => i).filter((i) => i % every === 0 || i === data.length - 1);
  })();

  const path = (s: Series) => {
    let d = '';
    let prev: [number, number] | null = null;
    data.forEach((row, i) => {
      const v = value(row, s.key);
      if (v == null) return;
      const p: [number, number] = [sx(xs[i]), sy(v)];
      if (!prev) d += `M${p[0]},${p[1]}`;
      else if (s.step) d += `H${p[0]}V${p[1]}`;
      else d += `L${p[0]},${p[1]}`;
      prev = p;
    });
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xs.forEach((v, i) => { if (Math.abs(sx(v) - px) < Math.abs(sx(xs[best]) - px)) best = i; });
    setHover(best);
  };

  const h = hover != null ? data[hover] : null;
  const hx = hover != null ? sx(xs[hover]) : 0;

  return (
    <div ref={box} className="relative h-full w-full">
      <svg
        width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block overflow-visible"
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeDasharray="3 3" />
            <text x={PAD.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={AXIS}>{t.toFixed(1)}%</text>
          </g>
        ))}
        {xTickIdx.map((i) => (
          <text key={i} x={sx(xs[i])} y={H - 6} textAnchor="middle" fontSize={12} fill={AXIS}>{xLabel(xs[i])}</text>
        ))}
        {referenceY != null && (
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(referenceY)} y2={sy(referenceY)} stroke="#CBBD9C" strokeDasharray="4 4" />
        )}
        {series.map((s) => (
          <g key={s.key}>
            <path d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />
            {data.map((row, i) => {
              const v = value(row, s.key);
              return v == null ? null : <circle key={i} cx={sx(xs[i])} cy={sy(v)} r={hover === i ? (s.dot ?? 3) + 2 : (s.dot ?? 3)} fill={s.color} />;
            })}
          </g>
        ))}
        {h && <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} stroke={GRID} />}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-xl border border-[#E3D8BE] bg-[#FDFBF5] px-3 py-2 text-xs text-[#0A192F] shadow-sm"
          style={{ left: `${(hx / W) * 100}%`, transform: hx > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
        >
          <div className="text-[#8B8676]">{tooltipLabel(h)}</div>
          {series.map((s) => {
            const v = value(h, s.key);
            // Ink text, coloured swatch: light series colours are unreadable as text.
            return v == null ? null : (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {s.name}: {v.toFixed(2)}%
              </div>
            );
          })}
        </div>
      )}
      {legend && (
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs leading-tight text-[#31445F]">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <svg width="18" height="4" aria-hidden="true"><line x1="0" x2="18" y1="2" y2="2" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 4' : undefined} /></svg>
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
