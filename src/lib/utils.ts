import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function formatCompactKES(v: number): string {
  if (v >= 1e9) return `KES ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `KES ${(v / 1e6).toFixed(1)}M`;
  return `KES ${Math.round(v).toLocaleString('en-KE')}`;
}
