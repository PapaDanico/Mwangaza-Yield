/**
 * The issuer's stated borrowing plan — the answer to the ladder's biggest
 * unmodelled risk.
 *
 * A reader building a ten-year ladder is making an implicit bet that
 * comparable paper will still be on offer when each rung matures. Until now
 * the app had nothing to say about that bet. The Medium-Term Debt Management
 * Strategy is the borrower stating its intention about exactly it: what share
 * of borrowing will be domestic, whether the T-bill stock grows or shrinks,
 * and whether maturities lengthen.
 *
 * WHY HAND-CURATED RATHER THAN SCRAPED
 * -------------------------------------
 * Not for lack of trying. The probe run of 26 July 2026 established that
 * pdmo.treasury.go.ke is unreachable from cloud runners (geo-blocked — it
 * loads fine on Kenyan mobile data), and the MTDS itself is published as a
 * 36-page SCAN with no text layer. A scraper against that is OCR against a
 * host that refuses the call, for a document that changes once a year.
 * Fifteen minutes of reading per quarter beats that on every axis, including
 * honesty: every figure in the JSON carries the exact table it came from.
 *
 * STALENESS IS A RENDERED STATE
 * ------------------------------
 * The recurring defect class in this codebase is the claim that was true once
 * and got outrun. A fiscal strategy quoted confidently fourteen months after
 * tabling is that defect. So the card must check age and say "we do not have
 * a current figure" past the window, exactly as the CPI reading does.
 */

import raw from '../../public/data/fiscal-context.json';

export interface FiscalContext {
  schema: number;
  curatedAt: string;
  issuanceIntent: {
    grossDomesticBorrowingSharePct: number;
    tbillShareOfDebtNowPct: number;
    tbillShareOfDebtTargetPct: number;
    targetYear: number;
    domesticAtmNowYears: number;
    domesticAtmTargetYears: number;
    asOf: string;
    source: string;
    sourceUrl: string;
  };
  nearTermSupply: {
    fiscalYear: string;
    netDomesticBorrowingKESBn: number;
    revisedFromKESBn: number;
    asOf: string;
    source: string;
    sourceUrl: string;
  };
  outturn: {
    fiscalYear: string;
    tbillsIssuedKESTn: number;
    bondsIssuedKESTn: number;
    asOf: string;
    source: string;
    sourceUrl: string;
  };
}

export const FISCAL_CONTEXT: FiscalContext = raw;

/**
 * The MTDS is an annual document tabled each February; a supplementary can
 * land any quarter. 15 months of slack covers one late tabling without
 * letting a two-year-old strategy masquerade as current.
 */
export const FISCAL_MAX_AGE_DAYS = 455;

export function fiscalAgeDays(now = new Date()): number {
  const curated = new Date(FISCAL_CONTEXT.curatedAt);
  return Math.floor((now.getTime() - curated.getTime()) / 86_400_000);
}

export function fiscalIsStale(now = new Date()): boolean {
  return fiscalAgeDays(now) > FISCAL_MAX_AGE_DAYS;
}
