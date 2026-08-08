import { isPlausiblePrice, MAX_PRICE, MIN_PRICE } from './prices';

/**
 * A sale quote that survives being sent to somebody else.
 *
 * WHAT THE SELL PAGE COULD NOT DO
 *
 * /sell prices a bond the reader is thinking of selling: their ISIN, face
 * value, settlement date, the dirty price they were quoted, commission and
 * levies. It is the page most likely to be shown to a second person — an
 * advisor, a spouse, the broker who gave the quote — and it was the one page
 * with no way to do that. A reader wanting a second opinion had to read nine
 * fields down the phone, or send a screenshot nobody can recalculate from.
 *
 * A link carries the whole quote, so the other person opens the same numbers
 * and can change one.
 *
 * THE PARAMS ARE HOSTILE INPUT, AND ARE PARSED AS SUCH
 *
 * Anyone holding the link can edit it. Every value is bounds-checked on the
 * way in AND on the way out, and anything that fails is dropped rather than
 * defaulted to a guess — a wrong price that looks deliberate is worse than an
 * empty field the reader fills in themselves.
 *
 * The price bound is `isPlausiblePrice` from lib/prices, deliberately reused
 * rather than restated: it is the same 40-160 range the price book already
 * enforces for a recorded price, and a quote arriving by link should not be
 * held to a different standard than one typed in.
 *
 * NOTHING HERE TRACKS ANYBODY. The sender builds the link on their own device
 * and the recipient's browser reads it. Mwangaza is a static export with no
 * server to log a query string, which is why this is a link and not an
 * account.
 */

/** The fields a quote link carries. Order is the order they are read back. */
export const QUOTE_FIELDS = [
  'isin',
  'face',
  'dirty',
  'quotedYTM',
  'commission',
  'levies',
  'settlement',
] as const;

export type QuoteField = (typeof QUOTE_FIELDS)[number];

export interface QuoteParams {
  isin?: string;
  face?: number;
  dirty?: number;
  quotedYTM?: number;
  commission?: number;
  levies?: number;
  settlement?: string;
}

/** Face values and fees above this are refused — no retail holding is this large. */
const MAX_AMOUNT = 10_000_000_000; // 10bn KES

/** CBK ISINs are alphanumeric and fixed-length; anything else is not one. */
const ISIN_RE = /^[A-Z0-9]{8,16}$/;

/** An ISO date, and a real one — "2026-02-31" parses in some engines and is not a day. */
function usableDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

function usableAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT;
}

/** A yield quoted as a percentage. Negative nominal yields do not occur here. */
function usableYield(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Appends a quote to a path, omitting anything that would not survive the
 * round trip. A link is read by people as well as machines — "dirty=NaN" in a
 * WhatsApp message costs more trust than the missing field does.
 */
export function buildQuoteLink(path: string, quote: QuoteParams): string {
  const search = new URLSearchParams();
  if (quote.isin && ISIN_RE.test(quote.isin)) search.set('isin', quote.isin);
  if (quote.face !== undefined && usableAmount(quote.face)) search.set('face', String(quote.face));
  if (quote.dirty !== undefined && isPlausiblePrice(quote.dirty)) {
    search.set('dirty', String(quote.dirty));
  }
  if (quote.quotedYTM !== undefined && usableYield(quote.quotedYTM)) {
    search.set('quotedYTM', String(quote.quotedYTM));
  }
  if (quote.commission !== undefined && usableAmount(quote.commission)) {
    search.set('commission', String(quote.commission));
  }
  if (quote.levies !== undefined && usableAmount(quote.levies)) {
    search.set('levies', String(quote.levies));
  }
  if (quote.settlement && usableDate(quote.settlement)) search.set('settlement', quote.settlement);

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Reads a quote back out, keeping only what is usable.
 *
 * One tampered field does not discard the rest: the remainder is still the
 * sender's quote, and dropping all of it would punish the recipient for
 * somebody else's edit.
 */
export function readQuoteParams(search: string): QuoteParams {
  const params = new URLSearchParams(search);
  const out: QuoteParams = {};

  const isin = params.get('isin');
  if (isin && ISIN_RE.test(isin)) out.isin = isin;

  const settlement = params.get('settlement');
  if (settlement && usableDate(settlement)) out.settlement = settlement;

  for (const [key, check] of [
    ['face', usableAmount],
    ['commission', usableAmount],
    ['levies', usableAmount],
    ['quotedYTM', usableYield],
  ] as const) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') continue;
    const value = Number(raw);
    if (check(value)) out[key] = value;
  }

  const dirty = params.get('dirty');
  if (dirty !== null && dirty.trim() !== '') {
    const value = Number(dirty);
    // Same 40-160 band the price book enforces for a price the reader records.
    if (isPlausiblePrice(value)) out.dirty = value;
  }

  return out;
}

/** The absolute link that goes into a shared message. */
export function shareableQuoteUrl(quote: QuoteParams, appUrl: string): string {
  return `${appUrl}${buildQuoteLink('/sell/', quote)}`;
}

export { MIN_PRICE, MAX_PRICE };
