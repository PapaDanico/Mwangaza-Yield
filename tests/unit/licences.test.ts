/**
 * Nothing ships without a licence we can point at.
 *
 * THIS TEST IS THE WHOLE POINT OF licences.ts
 * -------------------------------------------
 * The licence position had been researched twice before this and both times
 * the conclusion lived in prose. Prose cannot stop a scraper adding a source,
 * and the failure is silent in the worst way: the figure is right, the
 * citation is there, the page looks scrupulous, and the data is being
 * redistributed without the right to redistribute it.
 *
 * So this walks every record the app actually ships, resolves its `source`
 * against the registry, and fails on anything unregistered or refused. If it
 * ever passes vacuously — because the glob found nothing, or every file was
 * empty — that is the same as no test at all, so the sweep asserts its own
 * coverage first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  LICENCES,
  KNOWN_EXPOSURES,
  licenceFor,
  mayRedistribute,
} from '../../src/lib/licences';

const DATA_DIR = join(process.cwd(), 'public', 'data');

/** Every (file, source) pair in the shipped datasets. */
function shippedSources(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.json')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const row of parsed) {
      const src = (row as Record<string, unknown>)?.source;
      if (typeof src === 'string' && src.trim()) out.push({ file: name, source: src });
    }
  }
  return out;
}

const SHIPPED = shippedSources();

/**
 * A URL is not a source name. bonds.json cites the CBK PDF each bond was read
 * from, which is a provenance link rather than an attribution string, and the
 * host already tells us the publisher.
 */
const isUrl = (s: string) => /^https?:\/\//i.test(s);

describe('the sweep itself', () => {
  it('actually found data to check', () => {
    // A glob that silently matches nothing turns this whole file into
    // decoration that reports green.
    expect(SHIPPED.length).toBeGreaterThan(50);
    expect(new Set(SHIPPED.map((s) => s.file)).size).toBeGreaterThan(2);
  });
});

describe('licenceFor', () => {
  it('matches on the body of a qualified source string', () => {
    expect(licenceFor('CBK auction, 30 Jul 2026')?.id).toBe('CBK');
    expect(licenceFor('World Bank Open Data (CC BY 4.0)')?.id).toBe(
      'World Bank Open Data'
    );
    expect(licenceFor('CBK indicative')?.id).toBe('CBK');
  });

  it('returns null for a source nobody registered', () => {
    expect(licenceFor('Some Blog I Found')).toBeNull();
    expect(mayRedistribute('Some Blog I Found')).toBe(false);
  });

  it('refuses the aggregators, however plausible their data looks', () => {
    // These were all proposed as sources. Each grants a personal,
    // non-transferable licence and forbids redistribution outright — and each
    // is reselling the same CBK and KNBS figures we can get at the source.
    for (const id of ['Trading Economics', 'FocusEconomics', 'investing.com', 'CEIC']) {
      expect(mayRedistribute(id)).toBe(false);
      expect(licenceFor(id)?.verdict).toBe('refused');
    }
  });

  it('refuses KNBS and NSE, the two rights-reserved originators', () => {
    expect(mayRedistribute('KNBS')).toBe(false);
    expect(mayRedistribute('NSE')).toBe(false);
  });
});

describe('the registry', () => {
  it('quotes operative terms and dates every permitted verdict', () => {
    // A verdict with no quoted sentence and no URL is an opinion. The whole
    // value of this file is that each entry can be checked against the page it
    // was read from.
    for (const l of LICENCES.filter((x) => x.verdict === 'permitted')) {
      expect(l.terms.length, `${l.id} has no quoted terms`).toBeGreaterThan(40);
      expect(l.termsUrl, `${l.id} has no terms URL`).toMatch(/^https:\/\//);
      expect(l.attribution, `${l.id} has no attribution string`).not.toBe('');
      expect(l.checkedOn, `${l.id} has no check date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('gives a refused source no attribution string to copy by accident', () => {
    for (const l of LICENCES.filter((x) => x.verdict === 'refused')) {
      expect(l.attribution).toBe('');
    }
  });
});

describe('what the app actually ships', () => {
  const exposures = new Set(KNOWN_EXPOSURES.map((e) => e.source));

  it('cites nothing that is unregistered or refused', () => {
    const offenders = SHIPPED.filter(
      ({ source }) =>
        !isUrl(source) && !exposures.has(source) && !mayRedistribute(source)
    ).map(({ file, source }) => `${file}: ${source}`);

    expect(
      [...new Set(offenders)],
      'These sources ship without a licence permitting redistribution. Either ' +
        'register the licence in src/lib/licences.ts with quoted terms, ' +
        're-derive the figure from a source whose terms we can satisfy, or ' +
        'record it in KNOWN_EXPOSURES with a date it must be resolved by.'
    ).toEqual([]);
  });

  it('has not let a known exposure quietly outlive its deadline', () => {
    // An exception with no expiry is how a temporary problem becomes the
    // permanent state of the app.
    const today = new Date().toISOString().slice(0, 10);
    const overdue = KNOWN_EXPOSURES.filter((e) => e.resolveBy < today).map(
      (e) => `${e.source} (due ${e.resolveBy}): ${e.remedy}`
    );
    expect(overdue).toEqual([]);
  });

  it('keeps every known exposure real, so the list cannot rot', () => {
    // An exception for a source that is no longer shipped is stale permission
    // sitting in the codebase waiting to excuse something else.
    const shippedSet = new Set(SHIPPED.map((s) => s.source));
    for (const e of KNOWN_EXPOSURES) {
      expect(
        shippedSet.has(e.source),
        `KNOWN_EXPOSURES lists "${e.source}" but nothing ships it any more — delete the entry.`
      ).toBe(true);
      expect(e.remedy.length).toBeGreaterThan(40);
      expect(e.resolveBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
