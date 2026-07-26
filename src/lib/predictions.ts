/**
 * The prediction ledger: the bid assistant, held to account in public.
 *
 * The assistant quotes a range for every live auction. A range quoted after
 * the result publishes proves nothing — so this module records the range
 * BEFORE the auction closes and scores it against the clearing rate CBK later
 * publishes. The ledger is append-only by construction: a prediction, once
 * recorded, is never edited, and scoring only ever fills in the outcome
 * fields. `assertLedgerIntegrity` enforces that shape, and a unit test
 * enforces it on the shipped file.
 *
 * Why bother: "our stated range contained the actual weighted average N times
 * out of M" is the credibility artefact of the whole product — checkable by
 * anyone, from public data, with the recorded-on date proving it was a
 * forecast and not a memory. It is also the exit test docs/BUSINESS-MODEL.md
 * sets for the bid assistant.
 */

import type { AuctionPrint, AuctionSchedule, Bond } from '../types/bond';
import { normaliseCode, clearingRate } from './auction-history';
import { bidGuidance, yearsToMaturityAt } from './bid';

export interface Prediction {
  /** One bond within one auction; multi-bond offers get one entry per code. */
  issueCode: string;
  auctionDate: string;
  /** The date the range was recorded — the proof it was a forecast. */
  recordedOn: string;
  targetYears: number;
  toleranceYears: number;
  sampleSize: number;
  /** The stated range: full span and middle half. */
  low: number;
  p25: number;
  median: number;
  p75: number;
  high: number;
  /** True when the sample was below MIN_SAMPLE — recorded, but not a claim. */
  thin: boolean;
  // ---- filled in by scoring, never at recording time ----
  actualRate?: number;
  scoredOn?: string;
  /** Did the full low..high range contain the clearing rate? */
  hitRange?: boolean;
  /** Did the middle half (p25..p75) contain it? The stricter, honest test. */
  hitMiddleHalf?: boolean;
}

/**
 * One calendar entry can carry several bonds — "FXD1/2022/10 + FXD1/2021/20"
 * — and a switch auction writes "FXD1/2021/05 → FXD1/2012/20". Predictions
 * are per bond, so split on both separators.
 */
export function splitIssueCodes(combined: string): string[] {
  return combined
    .split(/[+→]/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Z]+\d*\/\d{4}\/\d/.test(s));
}

/**
 * Build predictions for every bond in every open or upcoming auction that is
 * not already in the ledger. Existing entries are returned untouched —
 * re-running this is safe daily, and MUST be, because the CI job that calls
 * it runs every morning.
 */
export function recordPredictions(
  ledger: Prediction[],
  auctions: AuctionSchedule[],
  prints: AuctionPrint[],
  bonds: Bond[],
  today: string
): Prediction[] {
  const have = new Set(ledger.map((p) => `${normaliseCode(p.issueCode)}|${p.auctionDate}`));
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  const added: Prediction[] = [];

  for (const a of auctions) {
    if (a.auctionDate <= today) continue; // the result may exist; too late to forecast
    for (const code of splitIssueCodes(a.issueCode)) {
      const key = `${normaliseCode(code)}|${a.auctionDate}`;
      if (have.has(key)) continue;

      // Remaining term for a re-opening; the label's tenor for a new issue.
      const known = byCode.get(normaliseCode(code));
      const labelTenor = parseFloat(code.split('/')[2]);
      const target = known
        ? yearsToMaturityAt(known, new Date(a.auctionDate))
        : labelTenor;
      if (!Number.isFinite(target) || target <= 0) continue;

      const taxExempt = known ? known.taxExempt : code.startsWith('IFB');
      const g = bidGuidance(prints, bonds, target, { taxExempt });
      if (!g.count) continue; // nothing to state, so state nothing

      have.add(key);
      added.push({
        issueCode: code,
        auctionDate: a.auctionDate,
        recordedOn: today,
        targetYears: Math.round(target * 100) / 100,
        toleranceYears: g.toleranceYears,
        sampleSize: g.count,
        low: g.low,
        p25: g.p25,
        median: g.median,
        p75: g.p75,
        high: g.high,
        thin: g.thin,
      });
    }
  }
  return [...ledger, ...added];
}

/**
 * Fill in outcomes for predictions whose auction has since published a
 * clearing rate. Only the outcome fields are ever written; the recorded
 * forecast is read-only history.
 */
export function scorePredictions(
  ledger: Prediction[],
  prints: AuctionPrint[],
  today: string
): Prediction[] {
  return ledger.map((p) => {
    if (p.scoredOn !== undefined) return p;
    // The print for this bond at (or just after) the predicted auction date —
    // CBK's calendar date and the result's date can differ by a day or two.
    const candidates = prints
      .filter(
        (x) =>
          normaliseCode(x.issueCode) === normaliseCode(p.issueCode) &&
          x.auctionDate >= p.recordedOn &&
          clearingRate(x) !== null
      )
      .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
    const print = candidates.find((x) => Math.abs(daysBetween(x.auctionDate, p.auctionDate)) <= 14);
    if (!print) return p;

    const actual = clearingRate(print)!;
    return {
      ...p,
      actualRate: actual,
      scoredOn: today,
      hitRange: actual >= p.low && actual <= p.high,
      hitMiddleHalf: actual >= p.p25 && actual <= p.p75,
    };
  });
}

const daysBetween = (a: string, b: string): number =>
  (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

export interface LedgerSummary {
  recorded: number;
  scored: number;
  /** Scored predictions that were not thin — the ones that count as claims. */
  claims: number;
  hitRange: number;
  hitMiddleHalf: number;
}

export function summariseLedger(ledger: Prediction[]): LedgerSummary {
  const scored = ledger.filter((p) => p.scoredOn !== undefined);
  const claims = scored.filter((p) => !p.thin);
  return {
    recorded: ledger.length,
    scored: scored.length,
    claims: claims.length,
    hitRange: claims.filter((p) => p.hitRange).length,
    hitMiddleHalf: claims.filter((p) => p.hitMiddleHalf).length,
  };
}

/**
 * The append-only guarantee, checkable: every entry of `before` must appear in
 * `after` with its forecast fields byte-identical; only outcome fields may be
 * added. Returns a list of violations (empty = clean).
 */
export function assertLedgerIntegrity(before: Prediction[], after: Prediction[]): string[] {
  const problems: string[] = [];
  const key = (p: Prediction) => `${normaliseCode(p.issueCode)}|${p.auctionDate}`;
  const afterBy = new Map(after.map((p) => [key(p), p]));
  const FORECAST_FIELDS: (keyof Prediction)[] = [
    'issueCode', 'auctionDate', 'recordedOn', 'targetYears', 'toleranceYears',
    'sampleSize', 'low', 'p25', 'median', 'p75', 'high', 'thin',
  ];
  for (const b of before) {
    const a = afterBy.get(key(b));
    if (!a) { problems.push(`${key(b)}: prediction removed`); continue; }
    for (const f of FORECAST_FIELDS) {
      if (a[f] !== b[f]) problems.push(`${key(b)}: forecast field '${f}' changed`);
    }
    if (b.scoredOn !== undefined && a.actualRate !== b.actualRate) {
      problems.push(`${key(b)}: scored outcome rewritten`);
    }
  }
  return problems;
}
