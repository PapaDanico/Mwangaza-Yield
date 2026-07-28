import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONSUMER_PAID_CAPABILITIES,
  CONSUMER_CAPABILITIES,
  INSTITUTION_PRODUCTS,
  FUNDING_NARRATIVE,
  isFreeToReaders,
} from '../../src/lib/tiers';
import { NOT_ADVICE } from '../../src/lib/provenance';

/**
 * The assertion this file exists for.
 *
 * Mwangaza Yield charges readers nothing, and the reason is regulatory rather
 * than sentimental: Kenya's 2025 capital markets licensing regulations reach
 * digital platforms giving automated, algorithm-driven investment guidance,
 * and remuneration is the limb of that test this project most clearly does not
 * meet. Charging would remove it.
 *
 * A position that important cannot live in a comment. If somebody adds a paid
 * consumer capability — reasonably, in good faith, because a document fee
 * looks harmless — this fails and points them at the paragraph explaining what
 * it would cost.
 */
describe('nothing here is sold to readers', () => {
  it('has no paid consumer capability at all', () => {
    expect(
      CONSUMER_PAID_CAPABILITIES,
      'a reader-facing capability has been priced. Read the header of src/lib/tiers.ts ' +
        'before changing this: charging individuals for algorithm-driven guidance on ' +
        'securities is the fact pattern the 2025 CMA licensing regulations describe.'
    ).toEqual([]);
  });

  it('leaves every capability free, including the report export', () => {
    for (const cap of CONSUMER_CAPABILITIES) {
      expect(isFreeToReaders(cap), `${cap} is not free to readers`).toBe(true);
    }
    // The one most likely to be monetised first, named so the diff is visible.
    expect(isFreeToReaders('export-report')).toBe(true);
  });

  it("would notice if the check itself were defanged", () => {
    // isFreeToReaders returning true unconditionally would satisfy everything
    // above. This proves it actually consults the list.
    const spy = [...CONSUMER_PAID_CAPABILITIES, 'compute'];
    expect(spy.includes('compute')).toBe(true);
    expect(CONSUMER_CAPABILITIES.length).toBeGreaterThan(3);
  });
});

describe('the institutional line', () => {
  it('lists products, each with a named buyer', () => {
    expect(INSTITUTION_PRODUCTS.length).toBeGreaterThanOrEqual(3);
    for (const p of INSTITUTION_PRODUCTS) {
      expect(p.buyer.length, `${p.id} has no buyer`).toBeGreaterThan(8);
      expect(p.summary.length, `${p.id} has no summary`).toBeGreaterThan(30);
    }
  });

  it('sells advice-adjacent products only to those who hold a licence', () => {
    // The rates feed is data and can go to anyone. Anything that feeds an
    // advice process must go to a party carrying its own authorisation —
    // that is the whole basis on which this is safe to sell.
    for (const p of INSTITUTION_PRODUCTS) {
      if (p.id === 'rates-feed') continue;
      expect(
        p.theyHoldTheLicence,
        `${p.id} is sold into an advice process without the buyer holding a licence`
      ).toBe(true);
    }
  });
});

describe('the narrative tells readers the truth about it', () => {
  it('says free without hedging, and says it is permanent', () => {
    expect(FUNDING_NARRATIVE.lead).toMatch(/free/i);
    expect(FUNDING_NARRATIVE.lead).toMatch(/permanent/i);
    expect(FUNDING_NARRATIVE.reassurance).toMatch(/does not|no part of this site becomes payable/i);
  });

  it('states the no-commission position and the permanence', () => {
    expect(FUNDING_NARRATIVE.reassurance).toMatch(/no commission/i);
    expect(FUNDING_NARRATIVE.reassurance).toMatch(/no part of this site becomes payable/i);
  });

  it('does not write its own not-advice disclaimer', () => {
    // provenance.ts owns that wording and it appears on every report. A second
    // one here, phrased differently, is two disclaimers that can drift — and
    // the weaker is the one a reader will quote back. The page renders
    // NOT_ADVICE itself.
    const prose = [FUNDING_NARRATIVE.lead, ...FUNDING_NARRATIVE.body, FUNDING_NARRATIVE.reassurance].join(' ');
    expect(prose).not.toMatch(/not investment advice/i);
    expect(NOT_ADVICE).toMatch(/not investment advice/i);
  });

  it('quotes no price to a reader', () => {
    const prose = [FUNDING_NARRATIVE.lead, ...FUNDING_NARRATIVE.body, FUNDING_NARRATIVE.reassurance].join(' ');
    expect(prose, 'a price has appeared in reader-facing copy').not.toMatch(/Ksh\s*[\d,]+/);
  });
});

/** Nothing may act on this module until the legal question is answered. */
describe('no part of the app gates on it', () => {
  const SRC = new URL('../../src', import.meta.url).pathname;
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
    });

  it('has no component withholding anything behind isFreeToReaders', () => {
    const offenders = walk(SRC).filter((f) => {
      if (f.endsWith('lib/tiers.ts')) return false;
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      return /if\s*\(\s*!?\s*isFreeToReaders\(/.test(src);
    });
    expect(offenders, `these gate on the tier module:\n${offenders.join('\n')}`).toEqual([]);
  });
});

/**
 * The statutory element, asserted so nobody has to remember it.
 *
 * Capital Markets Act, Cap 485A, s.2 defines an investment adviser as a person
 * who, FOR REMUNERATION, carries on the business of advising others concerning
 * securities, or as part of a regular business issues or promulgates analyses
 * or reports concerning securities.
 *
 * Limb (b) describes this application almost word for word. The only element
 * it does not meet is remuneration — so remuneration is not one consideration
 * among several here, it is the single thing standing between this project and
 * a licence obligation.
 *
 * That includes VOLUNTARY contributions. A donate button beside a bond ladder
 * report invites the argument that the reports are issued for remuneration,
 * and it is not a weak argument. The sister product does exactly that beside
 * its documents and is safe doing so, because a household budget is not a
 * security — which is precisely why the same pattern must not be copied here
 * on the grounds that it worked over there.
 */
describe('no path by which a reader could pay anything', () => {
  it('has no till, paybill, contribution or donation surface', () => {
    const SRC = new URL('../../src', import.meta.url).pathname;
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
      });

    const offenders = walk(SRC).filter((f) => {
      if (f.endsWith('lib/tiers.ts')) return false; // the file explaining why not
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      /* Specific artefacts of taking money, not the words. "Contribution" is
       * ordinary vocabulary in a savings context and matching it would report
       * the pension and SACCO copy — the same false positive the sister
       * product's guard had to be corrected for. */
      return /\bTill\s*(No|Number|:)|\bPay\s?bill\b|buy\s?goods|\bM-?PESA\s+(till|paybill)\b|donate|\bdonation button\b/i.test(
        src
      );
    });

    expect(
      offenders,
      'a payment surface has appeared on a securities-analytics product. Read the ' +
        'header of src/lib/tiers.ts: remuneration is the one element of the s.2 ' +
        'investment-adviser definition this product does not currently meet.\n' +
        offenders.join('\n')
    ).toEqual([]);
  });
});
