import { clsx, type ClassValue } from 'clsx';
import { formatKES } from './financial-engine';

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

/**
 * The compact form of formatKES — and it must carry the SAME currency label.
 *
 * It said "KES" while formatKES said "Ksh", so the goals card led with
 * "KES 9.2M" and explained it one line later as "to draw Ksh 1,200,000 a
 * year". Two formatters, one screen, two names for the shilling. The prefix is
 * now taken from formatKES itself rather than typed again here, so there is
 * nothing left to drift.
 */
const CURRENCY_PREFIX = formatKES(0).replace(/[\d.,\s]+$/, '');

export function formatCompactKES(v: number): string {
  if (v >= 1e9) return `${CURRENCY_PREFIX} ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${CURRENCY_PREFIX} ${(v / 1e6).toFixed(1)}M`;
  return `${CURRENCY_PREFIX} ${Math.round(v).toLocaleString('en-KE')}`;
}

/**
 * Read a number input, never returning less than zero.
 *
 * `min={0}` on a number input is only a form-validation hint — it does not stop
 * anyone typing or pasting a negative, and React reads the value regardless. The
 * result was a settlement cost of "-Ksh 500,000" and a portfolio worth minus
 * money, printed as confidently as any real figure. There is no such thing as a
 * negative investment, so the value is clamped where it is read rather than
 * defended against in every formatter downstream.
 *
 * `Number('')` is 0 and `Number('abc')` is NaN; both land on the fallback.
 */
export function nonNegativeNumber(raw: string, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
