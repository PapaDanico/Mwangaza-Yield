import { describe, it, expect } from 'vitest';
import {
  FISCAL_CONTEXT,
  FISCAL_MAX_AGE_DAYS,
  fiscalAgeDays,
  fiscalIsStale,
} from '../../src/lib/fiscal-context';

/**
 * Hand-curated data earns its keep only if it cannot rot silently. These
 * checks are the curation checklist made executable: every figure cited,
 * every date real, and the staleness guard actually guarding — because a
 * fiscal strategy quoted confidently two years after tabling is exactly the
 * "true once, outrun since" defect this codebase keeps finding.
 */
describe('fiscal context', () => {
  it('every section carries a citation naming its document, and a source URL', () => {
    for (const [name, section] of Object.entries({
      issuanceIntent: FISCAL_CONTEXT.issuanceIntent,
      nearTermSupply: FISCAL_CONTEXT.nearTermSupply,
      outturn: FISCAL_CONTEXT.outturn,
    })) {
      expect(section.source.length, `${name}: citation too thin to check`).toBeGreaterThan(30);
      // A URL is optional now, because one of them 404'd.
      //
      // The card printed http://www.parliament.go.ke/2026-2027-budget under a
      // "Read the documents" link. The source probe fetched it — 404 over both
      // http and https. Requiring a URL is what pressures the next curator to
      // put SOMETHING there, which is how a dead one got there; requiring that
      // a present one be well-formed, and letting absence be legal, is the
      // honest rule. The citation text stays mandatory either way.
      if (section.sourceUrl !== undefined) {
        expect(section.sourceUrl, `${name}: malformed source URL`).toMatch(/^https:\/\/[\w.-]+\.\w{2,}/);
      }
      expect(Number.isNaN(new Date(section.asOf).getTime()), `${name}: asOf is not a date`).toBe(false);
    }
  });

  it('the figures are internally coherent', () => {
    const i = FISCAL_CONTEXT.issuanceIntent;
    // The strategy is a REDUCTION in bills and a LENGTHENING of maturity —
    // if a future curation flips either direction, the card's prose becomes
    // a lie and this fails before it ships.
    expect(i.tbillShareOfDebtTargetPct).toBeLessThan(i.tbillShareOfDebtNowPct);
    expect(i.domesticAtmTargetYears).toBeGreaterThan(i.domesticAtmNowYears);
    expect(i.grossDomesticBorrowingSharePct).toBeGreaterThan(50);
    expect(i.targetYear).toBeGreaterThan(new Date(i.asOf).getFullYear());

    const s = FISCAL_CONTEXT.nearTermSupply;
    expect(s.netDomesticBorrowingKESBn).toBeGreaterThan(s.revisedFromKESBn);

    // The outturn is the card's own counter-evidence (bills-heavy issuance);
    // it must stay plausible against the strategy it contradicts.
    const o = FISCAL_CONTEXT.outturn;
    expect(o.tbillsIssuedKESTn).toBeGreaterThan(0);
    expect(o.bondsIssuedKESTn).toBeGreaterThan(0);
  });

  it('goes stale after the window instead of quoting an old strategy forever', () => {
    const curated = new Date(FISCAL_CONTEXT.curatedAt);
    const dayBefore = new Date(curated.getTime() + (FISCAL_MAX_AGE_DAYS - 1) * 86_400_000);
    const dayAfter = new Date(curated.getTime() + (FISCAL_MAX_AGE_DAYS + 1) * 86_400_000);
    expect(fiscalIsStale(dayBefore)).toBe(false);
    expect(fiscalIsStale(dayAfter)).toBe(true);
    expect(fiscalAgeDays(dayAfter)).toBeGreaterThan(FISCAL_MAX_AGE_DAYS);
  });

  it('is not already stale on the day it ships', () => {
    expect(
      fiscalIsStale(),
      `curatedAt is ${FISCAL_CONTEXT.curatedAt} — re-read the current documents and update it`
    ).toBe(false);
  });
});
