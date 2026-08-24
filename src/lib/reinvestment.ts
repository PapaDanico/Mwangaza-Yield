import type { AuctionPrint } from '../types/bond';
import { clearingRate, auctionKind } from './auction-history';

/**
 * How often a bond of a given remaining term has actually been on offer.
 *
 * A ladder is a bet that when each rung matures, something comparable will be
 * available to roll into. The ladder page states the borrower's INTENTION —
 * more bonds, longer bonds — from the debt strategy. Intention is not
 * evidence, and a reader deciding where to put ten years of savings deserves
 * the record rather than the plan.
 *
 * The record says something the plan does not. Since 2021, a bond with under
 * three years left has been offered in roughly one month in five, while long
 * paper has been offered in two months out of three. That is the same strategy
 * seen from the other end: lengthening the average maturity means the short
 * rungs of a ladder are the ones with nothing to roll into.
 *
 * WHY THIS DOES NOT JOIN bonds.json
 * ---------------------------------
 * The obvious implementation matches each auction to its bond to read the
 * maturity date. It is wrong, and quietly: bonds.json holds only bonds that
 * are CURRENTLY OUTSTANDING, so every bond that has already matured is absent.
 * Joining on it silently drops 2010-2016 almost entirely and keeps long bonds
 * while discarding short ones — a survivorship filter pointing in exactly the
 * direction that would flatter this analysis, since short-bond scarcity is the
 * finding. Measured: 240 rows survive the join, 370 do not need it.
 *
 * So maturity is derived from the issue code, which encodes the issue year and
 * the tenor. That is an approximation — the code does not say which day of the
 * year — and it is a small one: checked against the 56 bonds where both are
 * known, the median error is 96 days and the worst is 177. Bands are measured
 * in years, so an error under six months only matters at a boundary, and the
 * bands are wide enough that few auctions sit on one.
 */

/** Same shape as auction-history's, including fractional tenors like 6.5. */
const CODE_RE = /^([A-Z]+\d*)\/(\d{4})\/(\d{1,3}(?:\.\d+)?)$/;

/**
 * Measured against the 56 bonds carrying both a code and a maturity date.
 * Stated so the card can disclose it rather than implying day precision.
 */
export const MATURITY_APPROXIMATION_MEDIAN_ERROR_DAYS = 96;
export const MATURITY_APPROXIMATION_MAX_ERROR_DAYS = 177;

/** The window the statistics describe. Older prints are sparse and pre-date the current issuance pattern. */
export const REINVESTMENT_WINDOW_FROM_YEAR = 2021;

export interface TermBand {
  id: string;
  label: string;
  /** Inclusive lower bound, exclusive upper, in years remaining. */
  fromYears: number;
  toYears: number;
}

export const TERM_BANDS: TermBand[] = [
  { id: 'short', label: 'Under 3 years', fromYears: 0, toYears: 3 },
  { id: 'medium', label: '3 to 7 years', fromYears: 3, toYears: 7 },
  { id: 'long', label: '7 to 15 years', fromYears: 7, toYears: 15 },
  { id: 'very-long', label: 'Over 15 years', fromYears: 15, toYears: 100 },
];

/**
 * Approximate maturity from the issue code alone. Null when the code is not a
 * shape we recognise — never a guess, because a wrong maturity moves an
 * auction into the wrong band and the band IS the finding.
 */
export function approximateMaturity(issueCode: string): Date | null {
  const m = CODE_RE.exec(issueCode.trim().toUpperCase().replace(/\s+/g, ''));
  if (!m) return null;
  const issueYear = Number(m[2]);
  const tenorYears = Number(m[3]);
  if (!Number.isFinite(issueYear) || !Number.isFinite(tenorYears)) return null;
  // Mid-year, because the code does not carry a month. The error this
  // introduces is quantified above rather than hidden.
  const whole = Math.floor(tenorYears);
  const monthsExtra = Math.round((tenorYears - whole) * 12);
  return new Date(Date.UTC(issueYear + whole, 6 + monthsExtra, 1));
}

export function bandFor(yearsRemaining: number): TermBand | null {
  if (!(yearsRemaining > 0)) return null;
  return (
    TERM_BANDS.find((b) => yearsRemaining >= b.fromYears && yearsRemaining < b.toYears) ?? null
  );
}

export interface BandAvailability {
  band: TermBand;
  /** Distinct calendar months in the window that offered this band. */
  monthsOffered: number;
  /** Distinct calendar months in the window with any auction at all. */
  monthsObserved: number;
  /** monthsOffered / monthsObserved, 0-1. */
  share: number;
  /** Auctions counted. Small n is stated rather than smoothed over. */
  auctions: number;
  /** Median clearing rate across those auctions, or null when none carried one. */
  medianClearingRate: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Availability per band across the window.
 *
 * Counted in MONTHS rather than auctions on purpose. "Forty auctions of long
 * paper" says nothing about whether a reader maturing in March could act;
 * "offered in 43 of 64 months" answers the question they actually have.
 */
export function reinvestmentAvailability(
  prints: AuctionPrint[],
  fromYear: number = REINVESTMENT_WINDOW_FROM_YEAR
): BandAvailability[] {
  const monthsAll = new Set<string>();
  const monthsByBand = new Map<string, Set<string>>();
  const ratesByBand = new Map<string, number[]>();
  const countByBand = new Map<string, number>();

  for (const p of prints) {
    if (!p.auctionDate || !p.issueCode) continue;
    if (auctionKind(p) !== 'issuance') continue;
    const auctionDate = new Date(`${p.auctionDate}T00:00:00Z`);
    if (Number.isNaN(auctionDate.getTime())) continue;
    if (auctionDate.getUTCFullYear() < fromYear) continue;

    const maturity = approximateMaturity(p.issueCode);
    if (!maturity) continue;
    const yearsRemaining = (maturity.getTime() - auctionDate.getTime()) / (365.25 * 86_400_000);
    const band = bandFor(yearsRemaining);
    if (!band) continue;

    const monthKey = `${auctionDate.getUTCFullYear()}-${auctionDate.getUTCMonth()}`;
    monthsAll.add(monthKey);
    if (!monthsByBand.has(band.id)) monthsByBand.set(band.id, new Set());
    monthsByBand.get(band.id)!.add(monthKey);
    countByBand.set(band.id, (countByBand.get(band.id) ?? 0) + 1);

    const rate = clearingRate(p);
    if (rate !== null) {
      if (!ratesByBand.has(band.id)) ratesByBand.set(band.id, []);
      ratesByBand.get(band.id)!.push(rate);
    }
  }

  const monthsObserved = monthsAll.size;
  return TERM_BANDS.map((band) => {
    const monthsOffered = monthsByBand.get(band.id)?.size ?? 0;
    return {
      band,
      monthsOffered,
      monthsObserved,
      share: monthsObserved ? monthsOffered / monthsObserved : 0,
      auctions: countByBand.get(band.id) ?? 0,
      medianClearingRate: median(ratesByBand.get(band.id) ?? []),
    };
  });
}

/**
 * The availability a ladder rung will meet, by its own remaining term.
 * Null when the archive has too little to say — a thin band is reported as
 * unknown rather than as a confident percentage drawn from three auctions.
 */
export const MIN_AUCTIONS_FOR_A_CLAIM = 8;

export function availabilityForTerm(
  prints: AuctionPrint[],
  yearsRemaining: number
): BandAvailability | null {
  const band = bandFor(yearsRemaining);
  if (!band) return null;
  const found = reinvestmentAvailability(prints).find((a) => a.band.id === band.id);
  if (!found || found.auctions < MIN_AUCTIONS_FOR_A_CLAIM) return null;
  return found;
}
