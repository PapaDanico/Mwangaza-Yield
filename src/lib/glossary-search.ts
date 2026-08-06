/**
 * Finding a word in the glossary.
 *
 * WHY THIS EXISTS
 * ---------------
 * The glossary is 28 terms and about twelve thousand characters, navigable
 * only by a strip of anchor chips. That is fine for someone browsing and
 * hopeless for someone who arrived with a word in mind — which, given the page
 * is linked from every `<Term>` in the app, is most of the traffic.
 *
 * IT SEARCHES THE WHOLE ENTRY, NOT JUST THE HEADING
 * -------------------------------------------------
 * A reader who types "tax" is not asking for terms whose NAME contains "tax".
 * They are asking where tax is explained, and the answer — withholding, the
 * ten-year band, the infrastructure-bond exemption — lives in the bodies. A
 * title-only filter would return one entry and look like an answer while
 * hiding four better ones, which is worse than no search at all.
 *
 * The `also` field matters for the same reason: this project's readers meet
 * these ideas under several names ("WHT", "coupon rate", "par"), and a search
 * that only knew the canonical heading would fail exactly the reader who does
 * not yet know the canonical heading.
 *
 * WHY MATCHED FIELDS ARE REPORTED
 * -------------------------------
 * When a hit comes from the body rather than the title, the reader can be left
 * wondering why a result is there at all. `matchedIn` lets a surface say so
 * rather than leaving the list looking arbitrary.
 */

import type { Term } from './glossary';

export type MatchField = 'term' | 'also' | 'plain' | 'why' | 'precise';

export interface GlossaryHit {
  term: Term;
  matchedIn: MatchField[];
  /** True when the heading itself matched — those sort first. */
  titleMatch: boolean;
}

/** Case- and punctuation-insensitive, so "bid-to-cover" finds "bid to cover". */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Every term matching the query, headings first.
 *
 * An empty or whitespace query returns EVERYTHING rather than nothing. The
 * page must read as a complete reference when nobody has typed anything —
 * a search box that blanks the content until used would make the glossary
 * worse for the browsing reader in order to help the searching one.
 */
export function searchGlossary(terms: Term[], query: string): GlossaryHit[] {
  const q = norm(query);
  if (!q) return terms.map((term) => ({ term, matchedIn: [], titleMatch: false }));

  // Every word must appear somewhere in the entry, though not in the same
  // field: "withholding tax" should find an entry whose title says
  // "Withholding tax" and equally one whose title says "Tax" and whose body
  // explains withholding.
  const words = q.split(' ');
  const hits: GlossaryHit[] = [];

  for (const term of terms) {
    const fields: [MatchField, string][] = [
      ['term', norm(term.term)],
      ['also', norm(term.also ?? '')],
      ['plain', norm(term.plain)],
      ['why', norm(term.why ?? '')],
      ['precise', norm(term.precise ?? '')],
    ];
    const haystack = fields.map(([, v]) => v).join(' ');
    if (!words.every((w) => haystack.includes(w))) continue;

    const matchedIn = fields
      .filter(([, v]) => v && words.some((w) => v.includes(w)))
      .map(([k]) => k);
    hits.push({
      term,
      matchedIn,
      titleMatch: matchedIn.includes('term') || matchedIn.includes('also'),
    });
  }

  // Stable: title matches first, original order preserved within each group.
  return [...hits.filter((h) => h.titleMatch), ...hits.filter((h) => !h.titleMatch)];
}

/**
 * A short, honest note on where a body-only hit came from.
 *
 * Returns null for a title match, where the reason is self-evident and saying
 * it would be noise.
 */
export function whyMatched(hit: GlossaryHit): string | null {
  if (hit.titleMatch) return null;
  const label: Record<MatchField, string> = {
    term: 'the name',
    also: 'another name for it',
    plain: 'the explanation',
    why: 'why it matters',
    precise: 'the precise definition',
  };
  const parts = hit.matchedIn.map((m) => label[m]);
  if (!parts.length) return null;
  return `matched in ${parts.join(' and ')}`;
}
