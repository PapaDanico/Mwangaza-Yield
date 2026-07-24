import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Auction status derived from dates — the JSON snapshot goes stale between refreshes. */
export function effectiveAuctionStatus(a: {
  status: string;
  offerOpenDate: string;
  offerCloseDate: string;
  settlementDate: string;
}): 'upcoming' | 'open' | 'closed' | 'settled' {
  const s = a.status as 'upcoming' | 'open' | 'closed' | 'settled';
  if (s !== 'open' && s !== 'upcoming') return s;
  const today = new Date().toISOString().slice(0, 10);
  if (today > a.settlementDate) return 'settled';
  if (today > a.offerCloseDate) return 'closed';
  if (today >= a.offerOpenDate) return 'open';
  return 'upcoming';
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function formatCompactKES(v: number): string {
  if (v >= 1e9) return `KES ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `KES ${(v / 1e6).toFixed(1)}M`;
  return `KES ${Math.round(v).toLocaleString('en-KE')}`;
}
