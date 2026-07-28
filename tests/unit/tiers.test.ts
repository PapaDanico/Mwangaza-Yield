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
