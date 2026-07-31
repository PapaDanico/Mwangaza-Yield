import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { determineWHTRate } from '../../src/lib/financial-engine';

/**
 * Prose that states the withholding-tax rule must agree with the engine that
 * applies it.
 *
 * determineWHTRate is the single place the rule is DECIDED — exempt for an
 * IFB, 10% at ten years and above, 15% below. It is also stated in English, in
 * the reader's own words, in about, faq (twice), learn (twice), the T-bills
 * page and the goal report: seven hand-typed restatements of two numbers and a
 * threshold, none of them derived from the function.
 *
 * Repetition is not the defect. Explaining the rule where the reader meets it
 * is the right thing to do, and a glossary entry is no substitute for a
 * sentence in context. The defect is that the copies are unattached: change
 * determineWHTRate and the engine returns new figures while every page keeps
 * confidently quoting the old ones. Nothing errors. The pages still render.
 * A reader is simply told one number and shown another, and the disagreement
 * is invisible from inside the code — which is the same shape as the service
 * worker's VERSION, the unwired OG builder and the gold steps the palette
 * never had.
 *
 * Note this is a TAX RULE, so it changes by Finance Act, not by refactor. That
 * makes it more exposed, not less: the edit will be made by somebody working
 * from a gazette against the engine, and the prose is the part nobody greps.
 *
 * So the prose is checked against the function rather than against a copy of
 * its numbers. If the rule changes, this fails and names every page needing a
 * new sentence.
 */
const ROOT = new URL('../../', import.meta.url).pathname;

/** The rule as the engine actually applies it, asked rather than assumed. */
const SHORT = determineWHTRate({ taxExempt: false, tenorYears: 5 });
const LONG = determineWHTRate({ taxExempt: false, tenorYears: 10 });
const EXEMPT = determineWHTRate({ taxExempt: true, tenorYears: 5 });

/** The tenor at which the rate steps down, found by asking, not by reading. */
const THRESHOLD = (() => {
  for (let y = 1; y <= 30; y++) {
    if (determineWHTRate({ taxExempt: false, tenorYears: y }) === LONG) return y;
  }
  throw new Error('no threshold found — the rule is no longer a simple step');
})();

const pct = (r: number) => `${Math.round(r * 100)}%`;

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) sources(path, acc);
    else if (/\.tsx?$/.test(path)) acc.push(path);
  }
  return acc;
}

/* Comments stripped first. A note explaining the rule must not be able to
 * satisfy a check on what the page actually says — the same reason
 * controller-named.test.ts strips them. */
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * A percentage sitting within a sentence's reach of "withholding tax".
 *
 * The lookbehind matters. Without it `\d{1,2}%` matches the "56%" inside
 * "11.56% after withholding tax" on the learn page — a NET YIELD, not a rate,
 * and the first thing this guard flagged. A tax rate is never written with a
 * fractional part here, so requiring the digits not to follow a digit or a
 * decimal point separates the rule from the figures it acts on.
 */
const MENTIONS =
  /(?<![\d.])(\d{1,2})\s*%[^.<]{0,40}?withholding tax|withholding tax[^.<]{0,40}?(?<![\d.])(\d{1,2})\s*%/gi;

describe('the withholding-tax prose agrees with the engine', () => {
  const files = sources(`${ROOT}src`).filter((f) => !f.includes('/lib/financial-engine'));
  const found = files.flatMap((f) => {
    const text = strip(readFileSync(f, 'utf8'));
    return [...text.matchAll(MENTIONS)].map((m) => ({
      file: f.slice(ROOT.length),
      rate: Number(m[1] ?? m[2]) / 100,
      quote: m[0].replace(/\s+/g, ' ').slice(0, 90),
    }));
  });

  it('found the restatements, so the guard is not vacuous', () => {
    /* If this drops to zero the rule has stopped being explained to readers,
     * which is its own problem — a tax that silently reduces the headline
     * number is exactly what this product exists to make visible. */
    expect(found.length, 'nowhere explains withholding tax to the reader').toBeGreaterThan(3);
  });

  it('quotes only rates the engine can actually return', () => {
    const valid = new Set([SHORT, LONG, EXEMPT]);
    const wrong = found
      .filter((m) => !valid.has(m.rate))
      .map((m) => `${m.file}: "${m.quote}" — engine returns only ${[...valid].map(pct).join(', ')}`);
    expect(
      wrong,
      [
        'These sentences quote a withholding-tax rate the engine never applies.',
        'determineWHTRate in src/lib/financial-engine.ts is the rule; update the',
        'prose to match it, or the reader is told one number and shown another.',
      ].join(' ')
    ).toEqual([]);
  });

  it('states the threshold consistently wherever it states one', () => {
    /* "ten years" spelled out and "10 years" both count — this is about the
     * number being right, not about house style. */
    const written = new RegExp(`\\b(?:${THRESHOLD}|ten)\\b`, 'i');
    const wrong: string[] = [];
    for (const f of files) {
      const text = strip(readFileSync(f, 'utf8'));
      for (const m of text.matchAll(/withholding tax[^.<]{0,120}?(\d{1,2}|ten|five|fifteen|twenty)\s*(?:-|\s)years?/gi)) {
        if (!written.test(m[1])) wrong.push(`${f.slice(ROOT.length)}: "${m[0].replace(/\s+/g, ' ')}"`);
      }
    }
    expect(
      wrong,
      `the engine steps down at ${THRESHOLD} years; these sentences say otherwise`
    ).toEqual([]);
  });

  it('catches a disagreement when one is introduced', () => {
    /* Mutation check in both directions. The guard is only worth having if a
     * wrong figure would actually trip it. */
    const valid = new Set([SHORT, LONG, EXEMPT]);
    expect(valid.has(0.2), '20% must not be accepted').toBe(false);
    expect(valid.has(SHORT), 'the real short-tenor rate must be accepted').toBe(true);
    expect('15% withholding tax'.match(MENTIONS), 'the pattern must match real prose').not.toBeNull();
    expect('withholding tax is 10%'.match(MENTIONS), 'the pattern must match either order').not.toBeNull();
  });
});
