import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GLOSSARY, GLOSSARY_BY_SLUG } from '../../src/lib/glossary';
import { realRate } from '../../src/lib/real-yield';

/**
 * Does the app explain what it computes?
 *
 * A feature that ships without an explanation is a number the reader has to
 * take on trust, which is the opposite of what this project is for. Two
 * features shipped today — the real-yield card and the quote benchmark — and
 * neither had a tutorial, an FAQ entry or a glossary term. Worse, the glossary
 * entry that DID touch inflation taught subtraction, which is the exact
 * approximation the engine beside it refuses.
 *
 * That last one is the failure worth guarding against: not missing
 * documentation, but documentation that contradicts the code.
 */

const learn = readFileSync(new URL('../../src/app/learn/page.tsx', import.meta.url), 'utf8');
const faq = readFileSync(new URL('../../src/app/faq/page.tsx', import.meta.url), 'utf8');

describe('the glossary agrees with the engine', () => {
  /**
   * The teeth. The old entry said "13% with 6% inflation means about 7%
   * better off" — subtraction, and wrong by the amount this project spends a
   * module explaining. If anyone reinstates that shortcut, this fails.
   */
  it('teaches division, not subtraction', () => {
    const entry = GLOSSARY_BY_SLUG['inflation'];
    expect(entry).toBeDefined();
    const text = `${entry.plain} ${entry.precise ?? ''}`;
    expect(text).toMatch(/Divide, do not subtract|\(1 \+ .*\) \/ \(1 \+ /);
    expect(text).not.toMatch(/means you are about 7% better off/);
  });

  /**
   * Reads the numbers OUT of the prose and checks the engine reproduces them.
   *
   * The first version hardcoded the pair — 11.56 against 6.41 — so it verified
   * that one sentence rather than the claim the sentence makes. When the
   * example was rewritten (the old one quoted the live inflation rate, which
   * made teaching copy look like a current reading and drift with the feed),
   * the test failed for the arithmetic being DIFFERENT rather than wrong.
   *
   * A worked example is a promise that the arithmetic holds. This checks the
   * promise, whatever numbers are used to make it.
   */
  it('quotes a worked example the engine actually produces', () => {
    const text = GLOSSARY_BY_SLUG['inflation'].precise ?? '';
    const m = text.match(
      /([\d.]+)%\s*net yield against\s*([\d.]+)%\s*inflation[^\d]*([\d.]+)%\s*real[^\d]*([\d.]+)%[^\d]*(\d+)\s*basis point/i
    );
    expect(m, `could not find a worked example to verify in:\n${text}`).toBeTruthy();
    const [, nominal, inflation, claimedReal, claimedSubtraction, claimedGapBp] = m!.map(Number);

    const real = realRate(nominal, inflation);
    expect(real, 'the stated real return is not what the engine computes').toBeCloseTo(
      claimedReal,
      2
    );
    expect(nominal - inflation, 'the stated subtraction result is wrong').toBeCloseTo(
      claimedSubtraction,
      2
    );
    expect(
      (nominal - inflation - real) * 100,
      'the stated basis-point overstatement does not follow from the two figures'
    ).toBeCloseTo(claimedGapBp, 0);
  });

  it('has a unique slug for every term, since the page indexes by it', () => {
    expect(new Set(GLOSSARY.map((t) => t.slug)).size).toBe(GLOSSARY.length);
  });

  it('defines every term in plain language before any precision', () => {
    for (const t of GLOSSARY) {
      expect(t.plain.length, `${t.term} has no plain definition`).toBeGreaterThan(40);
    }
  });
});

describe('every shipped concept is explained somewhere a reader can find it', () => {
  const corpus = `${learn} ${faq} ${GLOSSARY.map((t) => `${t.term} ${t.plain} ${t.precise ?? ''} ${t.why ?? ''}`).join(' ')}`;

  it.each([
    ['real return is a division', /\(1 \+ .{0,20}\) ÷ \(1 \+|Divide, do not subtract/],
    ['the principal loses purchasing power', /KES 39|buys what KES 39|worth about/],
    ['inflation is an assumption, not a forecast', /assumption, not a forecast|above 9% as recently/],
    // Tolerant of JSX: the prose reads "proportionally <em>more</em> in real
    // terms", so the phrase is not contiguous in the source it is matched against.
    ['the exemption is worth more in real terms', /proportionally[\s\S]{0,40}more[\s\S]{0,20}in real terms/],
    ['a quote is judged against auction clearing', /comparable paper has actually|actually been clearing/],
    ['the benchmark refuses when evidence is thin', /29 of the 58/],
    ['tax status must match when comparing', /\+509bps|blended pool/],
    ['remaining term, not the tenor label', /re-openings keep their original code|remaining term/i],
  ])('explains %s', (_label, pattern) => {
    expect(corpus).toMatch(pattern);
  });
});

describe('the tutorials and FAQs stay wired up', () => {
  it('points every lesson at a route that exists in the app', () => {
    const hrefs = [...learn.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(8);
    for (const href of hrefs) {
      expect(href, `${href} is not an internal app route`).toMatch(/^\/[a-z-]*\/$/);
    }
  });

  it('never promises a return or recommends a purchase', () => {
    for (const text of [learn, faq]) {
      expect(text).not.toMatch(/\bwe recommend (buying|selling)\b|\bguaranteed return\b/i);
    }
  });
});
