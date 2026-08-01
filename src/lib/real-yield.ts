/**
 * What the money is actually worth.
 *
 * Every figure this app has ever shown is nominal. A reader sees 13.6% gross,
 * 11.56% net of withholding tax, and reasonably concludes they are getting
 * meaningfully richer. At a Kenyan CPI print in the mid-sixes they are getting
 * richer by about half that, and the principal they get back at maturity buys
 * a good deal less than the principal they put in.
 *
 * The worked examples below use 6.41% because that is what the app carried
 * when this was written. They are illustrations of the ARITHMETIC and are
 * deliberately not restated every time KNBS publishes — the live figure comes
 * from macro.json via currentInflation(), and quoting the current print in a
 * comment is how a file starts lying about itself. July 2026 was 6.5%.
 *
 * Nothing in the product said so. The macro panel shows CPI as a standalone
 * curiosity beside the CBR and the shilling; no bond number is adjusted by it.
 * That is the single largest gap between what the app reports and what the
 * reader experiences.
 *
 * THREE THINGS THIS GETS RIGHT THAT THE OBVIOUS VERSION DOES NOT
 * -------------------------------------------------------------
 * 1. FISHER EXACT, NOT SUBTRACTION. Real return is (1+n)/(1+i) − 1, not n − i.
 *    At Kenyan rates the difference is not academic: 11.56% net against 6.41%
 *    inflation is 4.84% real, where subtraction says 5.15% — a 31bp
 *    overstatement, and it grows with both rates.
 *
 * 2. ADJUST THE NET YIELD, NOT THE GROSS. Inflation and tax both take a bite,
 *    and taking them off the same starting number double-counts nothing but
 *    ordering them wrong overstates the result. Tax is charged on the nominal
 *    coupon, so tax comes off first and inflation deflates what survives.
 *    Applied to the gross yield this would flatter every taxable bond by the
 *    whole withholding rate — the same gross-for-net substitution that had a
 *    sister product overstating a T-bill ladder by three quarters of a point.
 *
 * 3. THE PRINCIPAL IS NOT PROTECTED. A coupon-bearing bond returns a fixed
 *    nominal face at maturity. Over a long bond that is where most of the real
 *    loss happens, and it is invisible in a yield figure. On a 15-year bond at
 *    6.41% inflation, Ksh 100 of face comes back worth Ksh 39.5 in today's
 *    money.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It will not forecast. Holding one month's y/y CPI constant for fifteen years
 * is an assumption, not a projection, and a wrong one — Kenyan inflation ran
 * above 9% as recently as 2023. So every result carries the rate it used, its
 * date and its source, and the copy says "at today's rate held constant"
 * rather than implying anyone knows. A reader who wants a different assumption
 * can pass one; that is the honest interface.
 */

import type { Bond, MacroIndicator } from '../types/bond';

/** A CPI print older than this is too stale to deflate anything with. */
export const CPI_MAX_AGE_DAYS = 120;

export interface InflationReading {
  /** Annual rate as a percentage, e.g. 6.41. */
  rate: number;
  /** ISO date of the print. */
  asOf: string;
  source: string;
  ageDays: number;
  stale: boolean;
  /**
   * True when the figure came from a substitute source because the
   * authoritative one could not be reached.
   *
   * KNBS publishes Kenya's CPI; CBK republishes the headline. When KNBS is
   * unreachable the pipeline falls back, which is the right call — but it was
   * recorded only inside the source string as "CBK (KNBS unavailable)" and no
   * reader ever saw the distinction. A number standing in for another number
   * should say so.
   */
  fallback: boolean;
}

/**
 * The most recent CPI print, or null. Null is a real answer: with no inflation
 * reading there is no real yield, and inventing one would be worse than the
 * nominal figure the reader already has.
 */
export function latestInflation(
  macro: MacroIndicator[],
  asOf: Date = new Date()
): InflationReading | null {
  const prints = macro
    .filter((m) => m.indicator === 'CPI' && Number.isFinite(m.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = prints[0];
  if (!latest) return null;
  const ageDays = Math.round(
    (asOf.getTime() - new Date(latest.date).getTime()) / 86_400_000
  );
  return {
    rate: latest.value,
    asOf: latest.date,
    // The legacy records encode the fallback in the source string as
    // "CBK (KNBS unavailable)". The card now states that in words, so leaving
    // the parenthetical in produced a sentence that said it twice: "Inflation
    // is CBK (KNBS unavailable) ... — a stand-in, because KNBS could not be
    // reached." The feed builder already strips it; this is the same strip on
    // the app's own read of macro.json, and it is why `fallback` is derived
    // BEFORE the string is cleaned.
    source: String(latest.source ?? '').replace(/\s*\(.*unavailable\)\s*/i, '').trim(),
    ageDays,
    stale: ageDays > CPI_MAX_AGE_DAYS,
    fallback: latest.fallback === true || /unavailable/i.test(latest.source ?? ''),
  };
}

/**
 * Fisher exact. Both arguments and the result are percentages.
 *
 * Deliberately not `nominal - inflation`. That approximation is fine at low
 * rates and misleading at Kenyan ones.
 */
export function realRate(nominalPct: number, inflationPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

export interface RealReturn {
  /** The yield the reader was already being shown, after withholding tax. */
  nominalNetYTM: number;
  inflationPct: number;
  /** Net of tax AND of inflation. The number that decides whether they gained. */
  realNetYTM: number;
  /** Before tax, after inflation — shown only to make the tax bite legible. */
  realGrossYTM: number;
  /** Positive means purchasing power grows; negative means it shrinks. */
  gainsPurchasingPower: boolean;
  yearsToMaturity: number;
  /**
   * What Ksh 100 of face value will buy at maturity, in today's money, at this
   * inflation rate held constant.
   */
  principalRealValuePer100: number;
  /** How much of the principal's purchasing power is lost, as a percentage. */
  principalErosionPct: number;
  /**
   * The inflation rate at which the real net yield is exactly zero. Arithmetically
   * this is the nominal net yield; it earns its own field because "inflation
   * would have to average above X for you to lose ground" is the question a
   * reader actually asks, and the restatement is where the value is.
   */
  breakEvenInflationPct: number;
  /** Plain-language reading, safe to render directly. */
  summary: string;
}

/**
 * Deflate a bond's nominal return by an inflation rate.
 *
 * `netYTM` and `grossYTM` come from `computeBondInvestment` — this deliberately
 * does not recompute them, so there is exactly one yield engine in the product
 * and this layer can never disagree with the number shown beside it.
 */
export function realReturn(
  bond: Bond,
  netYTM: number,
  grossYTM: number,
  inflationPct: number,
  asOf: Date = new Date()
): RealReturn {
  const realNetYTM = realRate(netYTM, inflationPct);
  const realGrossYTM = realRate(grossYTM, inflationPct);

  const yearsToMaturity = Math.max(
    0,
    (new Date(bond.maturityDate).getTime() - asOf.getTime()) / (365 * 86_400_000)
  );

  const principalRealValuePer100 =
    100 / Math.pow(1 + inflationPct / 100, yearsToMaturity);
  const principalErosionPct = 100 - principalRealValuePer100;

  const y = yearsToMaturity;
  const term = y >= 1 ? `${y.toFixed(1)} years` : `${Math.round(y * 12)} months`;
  const held = `at ${inflationPct.toFixed(2)}% inflation held constant`;

  const summary =
    realNetYTM > 0
      ? `After withholding tax and inflation this returns ${realNetYTM.toFixed(2)}% a year in `
        + `today's money — real growth, but ${(100 - (realNetYTM / netYTM) * 100).toFixed(0)}% less than `
        + `the ${netYTM.toFixed(2)}% headline suggests. Over ${term} the principal itself comes back `
        + `worth Ksh ${principalRealValuePer100.toFixed(0)} for every Ksh 100 of face value, ${held}.`
      : `After withholding tax and inflation this LOSES ${Math.abs(realNetYTM).toFixed(2)}% a year in `
        + `purchasing power. The ${netYTM.toFixed(2)}% net headline is below the ${inflationPct.toFixed(2)}% `
        + `inflation rate, so the money grows in shillings and shrinks in what it buys. Over ${term} the `
        + `principal comes back worth Ksh ${principalRealValuePer100.toFixed(0)} per Ksh 100 of face, ${held}.`;

  return {
    nominalNetYTM: netYTM,
    inflationPct,
    realNetYTM,
    realGrossYTM,
    gainsPurchasingPower: realNetYTM > 0,
    yearsToMaturity,
    principalRealValuePer100,
    principalErosionPct,
    breakEvenInflationPct: netYTM,
    summary,
  };
}

/**
 * What the tax exemption on an infrastructure bond is worth once inflation is
 * taken into account.
 *
 * In nominal terms the exemption is worth a fixed slice of the coupon — 15% or
 * 10% of it. In REAL terms it is worth proportionally far more, because the
 * exempted amount is measured against a much smaller real base. A reader
 * comparing an IFB to an FXD on headline yield alone systematically
 * undervalues the IFB, and the gap widens as inflation rises.
 *
 * Returns the multiple by which the exemption's real value exceeds its nominal
 * value, or null where there is no exemption to value or no real return to
 * measure against.
 */
export function exemptionRealMultiple(
  grossYTM: number,
  netYTM: number,
  inflationPct: number
): number | null {
  const nominalGain = grossYTM - netYTM;
  if (nominalGain <= 0) return null;
  const realGain = realRate(grossYTM, inflationPct) - realRate(netYTM, inflationPct);
  const realNet = realRate(netYTM, inflationPct);
  if (realNet <= 0) return null;
  // Share of the real return that the exemption accounts for, against the share
  // of the nominal return it accounts for.
  const realShare = realGain / (realNet + realGain);
  const nominalShare = nominalGain / grossYTM;
  if (nominalShare <= 0) return null;
  return realShare / nominalShare;
}
