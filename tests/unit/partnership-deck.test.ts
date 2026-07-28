import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * The same deck ships from two repositories, and it drifted in both.
 *
 * JiPange got a guard first, keyed to its own TOOL_META — which this repo
 * cannot use, because Mwangaza has no idea how many calculators JiPange
 * ships. So the copy here sat unchecked and kept the identical two defects:
 * slides 10 and 19 saying "18 calculators" while four other slides said 25,
 * and a closing slide reading
 *
 *     partners@jipangefinance.org [placeholder — confirm address]
 *
 * on a file offered for download from the licensing page.
 *
 * WHY THIS ASSERTS INTERNAL CONSISTENCY RATHER THAN A NUMBER
 * ---------------------------------------------------------
 * A test here cannot know the right count. But it does not need to: a deck
 * that states two different counts for the same product is wrong whichever
 * one is right, and that check needs no knowledge from outside the file. It
 * would have caught this in BOTH repositories, which the count-based guard
 * could only do in one.
 *
 * If the two copies are ever meant to be identical, that is a better fix than
 * either guard — but they are separate files in separate repositories today,
 * and a check that runs where the file lives is what stops the next drift.
 */

const DECK = 'public/partners/jipange-mwangaza-partnership-deck.pptx';

/** Addresses the two products actually publish. Anything else is a typo or an invention. */
const KNOWN_ADDRESSES = ['hello@jipangefinance.org', 'info@mwangazadigital.org'];

function slides(): { name: string; text: string }[] {
  const files = unzipSync(new Uint8Array(readFileSync(new URL(`../../${DECK}`, import.meta.url))));
  return Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort()
    .map((n) => ({ name: n, text: strFromU8(files[n]).replace(/<[^>]+>/g, '') }));
}

describe('the partnership deck we hand out', () => {
  const all = slides();

  it('opens at all', () => {
    // Without this, a corrupted archive would make every assertion below pass
    // vacuously on an empty list — the failure mode of a test that unzips.
    expect(all.length).toBeGreaterThan(10);
  });

  it('does not contradict itself about how many calculators exist', () => {
    const claims = new Map<string, string[]>();
    for (const s of all) {
      for (const m of s.text.matchAll(/(\d+)\s+calculators/g)) {
        claims.set(m[1], [...(claims.get(m[1]) ?? []), s.name]);
      }
    }
    expect(claims.size, 'the deck names no calculator count at all').toBeGreaterThan(0);
    const summary = [...claims.entries()].map(([n, w]) => `${n} on ${w.join(', ')}`).join(' | ');
    expect(claims.size, `the deck states more than one calculator count: ${summary}`).toBe(1);
  });

  it('does not contradict itself about how many planners exist', () => {
    const counts = new Set<string>();
    for (const s of all) for (const m of s.text.matchAll(/(\d+)\s+(?:goal )?planners/g)) counts.add(m[1]);
    expect([...counts].length, `planner counts disagree: ${[...counts].join(' vs ')}`).toBeLessThan(2);
  });

  it('carries no placeholder left over from drafting', () => {
    for (const s of all) {
      expect(s.text, `${s.name} still contains a drafting placeholder`).not.toMatch(
        /placeholder|\bTBC\b|TODO|confirm address|\bXXX\b|lorem ipsum/i
      );
    }
  });

  it('names only addresses these products actually publish', () => {
    const found = new Set<string>();
    for (const s of all) for (const m of s.text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)) found.add(m[0]);
    expect(found.size, 'the deck gives no contact address at all').toBeGreaterThan(0);
    for (const a of found) {
      expect(KNOWN_ADDRESSES, `${a} is named in the deck but published nowhere`).toContain(a);
    }
  });
});
