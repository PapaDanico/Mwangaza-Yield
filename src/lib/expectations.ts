/**
 * What the market EXPECTS, kept firmly apart from what has been MEASURED.
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT ROWS IN macro.json
 * --------------------------------------------------------
 * Everything in macro.json is a published statistic: the CBR was set at an MPC
 * meeting, the CPI was released by KNBS, the shilling closed where it closed.
 * These are none of those. They are the opinions of 400 firms — 37 commercial
 * banks, 14 microfinance banks and a non-bank sample across eight towns —
 * collected by CBK before an MPC meeting.
 *
 * That difference is the whole reason for the separation. A reader who cannot
 * tell a forecast from a measurement will act on a forecast as though somebody
 * had counted something, and this codebase has already shipped the milder
 * version of that mistake more than once. So expectations live in their own
 * file, load through their own module, and are labelled as expectations
 * everywhere they surface.
 *
 * THEY MUST NOT FEED A VERDICT
 * ----------------------------
 * `macroRegime` reaches a conclusion about whether conditions favour bond
 * investors, and it is built from measured figures. Nothing here is wired into
 * it. An opinion that moves a verdict is an opinion wearing a measurement's
 * clothes, and `tests/unit/macro-regime.test.ts` exists because of exactly
 * that class of defect.
 *
 * WHAT THEY ARE GOOD FOR
 * ----------------------
 * The real return on a bond depends on inflation over the LIFE of the bond,
 * not on last month's print. A 10-year bond priced against a July CPI is
 * priced against a number that will be wrong for most of its life. Survey
 * expectations are the only forward-looking inflation series available here,
 * and pairing one with a nominal yield is the honest way to ask "what might
 * this actually earn in real terms" — provided the answer is labelled as
 * resting on an opinion, which `expectedRealRate` returns explicitly.
 */

import rows from '../../public/data/expectations.json';

export interface ExpectationRow {
  id: string;
  indicator: string;
  horizon: string;
  horizonMonths: number;
  respondent: string;
  value: number;
  unit: string;
  surveyDate: string;
  source: string;
  sourceUrl: string;
}

export interface HorizonExpectation {
  horizon: string;
  horizonMonths: number;
  banks: number | null;
  nonBanks: number | null;
  /** Midpoint of the two panels, or whichever exists alone. Null if neither. */
  midpoint: number | null;
}

export const EXPECTATIONS = rows as ExpectationRow[];

/** The survey these figures came from, for attribution at the point of use. */
export function expectationsSource(): { source: string; sourceUrl: string; surveyDate: string } | null {
  const first = EXPECTATIONS[0];
  if (!first) return null;
  return { source: first.source, sourceUrl: first.sourceUrl, surveyDate: first.surveyDate };
}

/**
 * Inflation expectations grouped by horizon, shortest first.
 *
 * Banks and non-banks are reported separately by CBK and differ materially —
 * 6.24 against 5.05 at one year in the July 2026 survey. Averaging them into a
 * single number would hide a disagreement that is itself the information, so
 * both are carried and the midpoint is offered as a convenience rather than as
 * the headline.
 */
export function inflationExpectations(): HorizonExpectation[] {
  const byHorizon = new Map<number, HorizonExpectation>();

  for (const r of EXPECTATIONS) {
    if (r.indicator !== 'INFLATION_EXPECTATION') continue;
    const existing = byHorizon.get(r.horizonMonths) ?? {
      horizon: r.horizon,
      horizonMonths: r.horizonMonths,
      banks: null,
      nonBanks: null,
      midpoint: null,
    };
    if (r.respondent === 'Banks') existing.banks = r.value;
    else if (r.respondent === 'Non-banks') existing.nonBanks = r.value;
    byHorizon.set(r.horizonMonths, existing);
  }

  const out = [...byHorizon.values()].sort((a, b) => a.horizonMonths - b.horizonMonths);
  for (const h of out) {
    const both = [h.banks, h.nonBanks].filter((v): v is number => v !== null);
    h.midpoint = both.length ? both.reduce((a, b) => a + b, 0) / both.length : null;
  }
  return out;
}

/** The expectation closest to a bond's remaining life, or null if none fits. */
export function expectationForTenor(years: number): HorizonExpectation | null {
  const all = inflationExpectations();
  if (!all.length || !Number.isFinite(years) || years <= 0) return null;
  const months = years * 12;
  return all.reduce((best, h) =>
    Math.abs(h.horizonMonths - months) < Math.abs(best.horizonMonths - months) ? h : best
  );
}

export interface ExpectedReal {
  /** The nominal that was passed in, unchanged. */
  nominal: number;
  /** Expected inflation used, and which panel it came from. */
  expectedInflation: number;
  basis: string;
  /** nominal − expected inflation. */
  realRate: number;
  /** Always true. Present so a caller cannot render this without saying so. */
  restsOnOpinion: true;
}

/**
 * A nominal yield less expected inflation over a matching horizon.
 *
 * Returns null rather than a number when there is no expectation to use —
 * absence is not zero, and a "real rate" computed against a missing forecast
 * would be the nominal wearing a disguise.
 *
 * `restsOnOpinion` is not decoration. It is returned on every result so that a
 * component destructuring this cannot easily present the figure without the
 * qualifier travelling alongside it.
 */
export function expectedRealRate(
  nominal: number | null,
  years: number,
  panel: 'banks' | 'nonBanks' | 'midpoint' = 'midpoint'
): ExpectedReal | null {
  if (nominal === null || !Number.isFinite(nominal)) return null;
  const h = expectationForTenor(years);
  if (!h) return null;
  const expected = h[panel];
  if (expected === null || !Number.isFinite(expected)) return null;
  const basis =
    panel === 'banks' ? 'banks' : panel === 'nonBanks' ? 'non-bank firms' : 'banks and non-bank firms';
  return {
    nominal,
    expectedInflation: expected,
    basis: `${h.horizon}, ${basis}`,
    realRate: nominal - expected,
    restsOnOpinion: true,
  };
}
