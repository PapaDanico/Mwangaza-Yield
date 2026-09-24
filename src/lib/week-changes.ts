import type { AuctionPrint, TBill } from '../types/bond';
import type { CpiPoint } from './db';

/**
 * What moved since the reader last looked — computed only from pairs of real,
 * dated figures. A line with no previous value to compare against is dropped,
 * never shown as a change from zero (see "Absence is not zero" in CLAUDE.md).
 */
export interface WeekChange {
  id: string;
  label: string;
  /** e.g. "8.78% / 8.89% / 9.04%" */
  value: string;
  /** e.g. "down 0.6 / 1.5 / 1.4 bp" — null when there is nothing to compare. */
  change: string | null;
  direction: 'up' | 'down' | 'flat' | null;
  asOf: string;
}

const bp = (a: number, b: number) => Math.round((a - b) * 1000) / 10;

function dir(delta: number): WeekChange['direction'] {
  if (Math.abs(delta) < 0.05) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function describeBp(deltas: number[]): string {
  const all = deltas.map(dir);
  const word = all.every((d) => d === 'down') ? 'down' : all.every((d) => d === 'up') ? 'up' : 'mixed';
  return `${word} ${deltas.map((d) => Math.abs(d).toFixed(1)).join(' / ')} bp`;
}

export function tbillChange(tbills: TBill[]): WeekChange | null {
  const rows = [...tbills].sort((a, b) => a.tenorDays - b.tenorDays);
  if (!rows.length) return null;
  const value = rows.map((r) => `${r.discountRate.toFixed(2)}%`).join(' / ');
  const comparable = rows.every((r) => typeof r.previousDiscountRate === 'number');
  const deltas = comparable ? rows.map((r) => bp(r.discountRate, r.previousDiscountRate as number)) : [];
  const overall = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;
  return {
    id: 'tbills',
    label: `T-bills ${rows.map((r) => r.tenorDays).join(' / ')}-day`,
    value,
    change: comparable ? describeBp(deltas) : null,
    direction: comparable ? dir(overall) : null,
    asOf: rows[0].auctionDate,
  };
}

export function latestBondAuction(prints: AuctionPrint[]): WeekChange | null {
  const dated = prints.filter((p) => typeof p.weightedAverageRate === 'number');
  if (!dated.length) return null;
  const last = dated.reduce((m, p) => (p.auctionDate > m ? p.auctionDate : m), '');
  const day = dated.filter((p) => p.auctionDate === last);
  return {
    id: 'bonds',
    label: 'Latest bond auction',
    value: day.map((p) => `${p.issueCode} ${(p.weightedAverageRate as number).toFixed(2)}%`).join(' · '),
    change: null,
    direction: null,
    asOf: last,
  };
}

export function cpiChange(history: CpiPoint[]): WeekChange | null {
  const pts = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const now = pts[pts.length - 1];
  if (!now) return null;
  const prev = pts[pts.length - 2];
  const month = new Date(`${now.date}T00:00:00`).toLocaleDateString('en-KE', { month: 'long' });
  return {
    id: 'cpi',
    label: `Inflation, ${month}`,
    value: `${now.value.toFixed(1)}%`,
    change: prev ? `${now.value >= prev.value ? 'up' : 'down'} from ${prev.value.toFixed(1)}%` : null,
    direction: prev ? dir(now.value - prev.value) : null,
    asOf: now.date,
  };
}

export function weekChanges(tbills: TBill[], prints: AuctionPrint[], cpi: CpiPoint[]): WeekChange[] {
  return [tbillChange(tbills), latestBondAuction(prints), cpiChange(cpi)].filter(
    (c): c is WeekChange => c !== null
  );
}
