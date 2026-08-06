import { describe, it, expect } from 'vitest';
import { searchGlossary, whyMatched } from '../../src/lib/glossary-search';
import { GLOSSARY } from '../../src/lib/glossary';

const slugs = (q: string) => searchGlossary(GLOSSARY, q).map((h) => h.term.slug);

describe('searchGlossary', () => {
  it('returns EVERYTHING for an empty query', () => {
    // A search box that blanks the page until used makes the glossary worse
    // for the browsing reader in order to help the searching one.
    expect(searchGlossary(GLOSSARY, '')).toHaveLength(GLOSSARY.length);
    expect(searchGlossary(GLOSSARY, '   ')).toHaveLength(GLOSSARY.length);
  });

  it('narrows on a real term', () => {
    const out = slugs('coupon');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(GLOSSARY.length);
  });

  it('SEARCHES BODIES, not just headings', () => {
    // The whole justification for the module. A title-only filter would
    // return one entry and look like an answer while hiding better ones.
    const titleOnly = GLOSSARY.filter((t) => /tax/i.test(t.term)).length;
    const full = slugs('tax').length;
    expect(full).toBeGreaterThan(titleOnly);
  });

  it('puts heading matches first', () => {
    // 'tax' is chosen because it produces BOTH kinds. The first version of
    // this wrapped the assertion in `if (firstNonTitle > 0)`, so removing the
    // ordering entirely left it green — a test that can skip itself.
    const hits = searchGlossary(GLOSSARY, 'tax');
    const title = hits.filter((h) => h.titleMatch).length;
    const body = hits.length - title;
    expect(title, 'fixture query no longer yields a title match').toBeGreaterThan(0);
    expect(body, 'fixture query no longer yields a body-only match').toBeGreaterThan(0);
    expect(hits.slice(0, title).every((h) => h.titleMatch)).toBe(true);
    expect(hits.slice(title).every((h) => !h.titleMatch)).toBe(true);
  });

  it('ignores case and punctuation', () => {
    // Asserting non-empty FIRST. The first version compared two result sets
    // for equality, so deleting normalisation made both empty and the test
    // passed on [] === [].
    const hyphen = slugs('bid-to-cover');
    const shouty = slugs('BID TO COVER');
    expect(hyphen.length, 'punctuated query found nothing').toBeGreaterThan(0);
    expect(shouty.length, 'upper-case query found nothing').toBeGreaterThan(0);
    expect(hyphen).toEqual(shouty);
    expect(slugs('Coupon').length).toBeGreaterThan(0);
    expect(slugs('Coupon')).toEqual(slugs('coupon'));
  });

  it('requires every word, but not in one field', () => {
    const both = slugs('withholding tax');
    expect(both.length).toBeGreaterThan(0);
    for (const s of both) {
      const t = GLOSSARY.find((x) => x.slug === s)!;
      const all = [t.term, t.also, t.plain, t.why, t.precise].join(' ').toLowerCase();
      expect(all).toContain('withholding');
      expect(all).toContain('tax');
    }
  });

  it('returns nothing for a word that is genuinely absent', () => {
    expect(searchGlossary(GLOSSARY, 'zzzquux')).toEqual([]);
  });

  it('never invents a hit whose fields do not contain the query', () => {
    for (const hit of searchGlossary(GLOSSARY, 'inflation')) {
      const all = [hit.term.term, hit.term.also, hit.term.plain, hit.term.why, hit.term.precise]
        .join(' ').toLowerCase();
      expect(all).toContain('inflation');
    }
  });

  it('preserves the authored order within each group', () => {
    const hits = searchGlossary(GLOSSARY, '');
    expect(hits.map((h) => h.term.slug)).toEqual(GLOSSARY.map((t) => t.slug));
  });

  it('does not lose or duplicate entries', () => {
    const out = slugs('');
    expect(new Set(out).size).toBe(out.length);
  });
});

describe('whyMatched', () => {
  it('says nothing when the heading matched — the reason is self-evident', () => {
    const hit = searchGlossary(GLOSSARY, 'coupon').find((h) => h.titleMatch);
    if (hit) expect(whyMatched(hit)).toBeNull();
  });

  it('explains a body-only hit so the list does not look arbitrary', () => {
    const hit = searchGlossary(GLOSSARY, 'tax').find((h) => !h.titleMatch);
    if (hit) {
      const note = whyMatched(hit);
      expect(note).toBeTruthy();
      expect(note).toMatch(/matched in/);
    }
  });
});

describe('the glossary data itself', () => {
  it('has unique slugs, so anchors cannot collide', () => {
    const s = GLOSSARY.map((t) => t.slug);
    expect(new Set(s).size).toBe(s.length);
  });

  it('every entry has a plain-English explanation', () => {
    for (const t of GLOSSARY) {
      expect(t.plain, `${t.slug} has no plain explanation`).toBeTruthy();
    }
  });
});
