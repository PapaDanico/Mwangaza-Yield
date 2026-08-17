import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Which sovereign indicators we ship, pinned.
 *
 * context.json went from six indicators to seven on a routine refresh and no
 * test noticed. `refuse_if_collapsed` guards the FLOOR — it refuses to publish
 * fewer than six of eight — and nothing guards the identity of what is there.
 * So an indicator can appear, or vanish, or be swapped, and every suite stays
 * green while the sovereign context panel silently changes what it claims.
 *
 * That is not hypothetical harm. The seventh indicator arriving is how we
 * discovered that /sources was telling readers we publish no public-debt
 * figures at all, while the app was serving three of them.
 *
 * A NEW indicator fails this test on purpose. Adding an id here is a
 * ten-second change, and the point is that somebody looks at the page copy
 * when the data set moves.
 */

const context = JSON.parse(readFileSync('public/data/context.json', 'utf8')) as {
  id: string;
  label: string;
  asOf: string;
  fetchedAt?: string;
}[];

/** Every indicator the app is known to ship, by its stable id. */
const EXPECTED = [
  'wb-ny-gdp-mktp-kd-zg', // GDP growth
  'wb-fi-res-totl-mo', // Reserves (import cover)
  'wb-ne-exp-gnfs-zs', // Exports / GDP
  'wb-bn-cab-xoka-gd-zs', // Current account / GDP
  'wb-gc-xpn-intp-rv-zs', // Interest / government revenue
  'wb-dt-dod-dect-gn-zs', // External debt / GNI
  'wb-dt-tds-dect-ex-zs', // Debt service / exports
  'wb-dt-dod-dect-cd', // External debt stock (US$ bn) — landed 2026-08-17
] as const;

/**
 * Asked for and not returned. The World Bank publishes no observation for
 * Kenya against this code, which is the source's answer and not our failure —
 * `fetchedAt` on every shipped row is what distinguishes the two.
 */
const KNOWN_ABSENT = ['wb-gc-dod-totl-gd-zs']; // Government debt / GDP

/**
 * Asked for, and its first observation has not landed yet.
 *
 * The set assertion below is exact equality, deliberately — an indicator
 * cannot appear or vanish without somebody editing this file. That is the
 * right property and it has an awkward consequence: adding an indicator to
 * worldbank.py and adding its id here CANNOT happen in the same green commit,
 * because context.json is only rewritten by a scheduled refresh. Whichever
 * order you choose, main is red until the other half lands.
 *
 * Going red for a day is not a small cost here. The refresh commits data on a
 * schedule, so the failure arrives unattended, on a commit nobody is watching,
 * and a suite that is expected to be red is a suite nobody reads.
 *
 * So an incoming indicator is tolerated in EITHER state — present or absent —
 * and only until its deadline. After that this fails, because an indicator
 * that never arrived is not "incoming", it is a code the World Bank does not
 * answer for and belongs in KNOWN_ABSENT with the /sources copy to match.
 * The "somebody must look" property survives: you still cannot add one without
 * editing this file, and you cannot leave it half-added forever.
 */
const EXPECTED_INCOMING: { id: string; label: string; arrivesBy: string }[] = [
  // Empty, and that is the healthy state. wb-dt-dod-dect-cd sat here from
  // 2026-08-16 until it landed on 2026-08-17 — one refresh later than
  // intended, because the first attempt died on a budget that had never
  // counted the World Bank's query-shape retries. The mechanism did its job:
  // main stayed green through the gap, and the "promote it once it lands"
  // assertion is what put it in EXPECTED above rather than leaving it
  // permanently exempt from the exact-set check.
];

describe('the sovereign indicator set is what we think it is', () => {
  it('ships a real file', () => {
    expect(context.length).toBeGreaterThan(3);
  });

  it('ships exactly the indicators we have accounted for', () => {
    const incoming = new Set(EXPECTED_INCOMING.map((i) => i.id));
    const ids = context
      .map((i) => i.id)
      .filter((id) => !incoming.has(id))
      .sort();
    expect(ids).toEqual([...EXPECTED].sort());
  });

  it('does not let an incoming indicator stay incoming forever', () => {
    // A code the World Bank never answers for would otherwise sit here
    // indefinitely, exempt from the exact-set check it exists to defer.
    const today = new Date().toISOString().slice(0, 10);
    const overdue = EXPECTED_INCOMING.filter(
      (i) => i.arrivesBy < today && !context.some((c) => c.id === i.id)
    ).map(
      (i) =>
        `${i.id} (${i.label}) was due by ${i.arrivesBy} and has not arrived — ` +
        'move it to KNOWN_ABSENT and fix the /sources copy, or find out why the fetch fails.'
    );
    expect(overdue).toEqual([]);
  });

  it('promotes an incoming indicator once it has actually landed', () => {
    // Arrived means accounted for. Leaving it on the incoming list would keep
    // it permanently exempt from the exact-set assertion.
    const landed = EXPECTED_INCOMING.filter((i) =>
      context.some((c) => c.id === i.id)
    ).map((i) => `${i.id} has landed — move it from EXPECTED_INCOMING to EXPECTED.`);
    expect(landed).toEqual([]);
  });

  it('does not ship the one the World Bank has no data for', () => {
    // If this ever fails, the API started answering and the /sources copy
    // about debt to GDP needs revisiting rather than quietly becoming true.
    for (const absent of KNOWN_ABSENT) {
      expect(context.some((i) => i.id === absent)).toBe(false);
    }
  });

  it('every shipped indicator carries a fetch stamp', () => {
    // The field that separates "the World Bank has no newer figure" from "our
    // fetch stopped". A row without it is a row we cannot reason about.
    for (const i of context) {
      expect(i.fetchedAt, `${i.id} has no fetchedAt`).toBeTruthy();
    }
  });
});

describe('the sources page does not contradict the data', () => {
  /**
   * /sources said, in public: "We ask the API for all four and it returns no
   * observation for Kenya against any of them, so the app has never shown
   * one." Three of those four were shipping at the time.
   *
   * Prose cannot be checked, but this specific contradiction can: if the app
   * ships a debt indicator, the page must not claim it shows none.
   */
  const sources = readFileSync('src/app/sources/page.tsx', 'utf8');
  const DEBT_IDS = ['wb-gc-xpn-intp-rv-zs', 'wb-dt-dod-dect-gn-zs', 'wb-dt-tds-dect-ex-zs'];

  it('ships debt indicators, which is the premise of this check', () => {
    const shipped = DEBT_IDS.filter((id) => context.some((i) => i.id === id));
    expect(shipped.length).toBeGreaterThan(0);
  });

  it('does not claim the app shows no debt figures', () => {
    expect(sources).not.toMatch(/the app has never shown one/);
    expect(sources).not.toMatch(/so we show none/);
  });

  /**
   * The page counts out loud — "Seven figures", "we ask it for eight". A number
   * written in prose is the first thing to go stale when the data moves, and it
   * goes stale silently: nothing renders red, the sentence just becomes untrue.
   * So the words are checked against the file they describe.
   */
  const WORDS: Record<number, string> = {
    6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine',
  };

  it('states the shipped count in words, and the words are right', () => {
    const word = WORDS[context.length];
    expect(word, `no word for ${context.length} indicators`).toBeTruthy();
    expect(sources).toMatch(new RegExp(`${word} figures`));
  });

  it('states how many we ask for, and it matches the scraper', () => {
    // The scraper's list is the ONLY place the asked-for count is authoritative.
    // Reading it here is what makes "eight" on the page a fact rather than a
    // recollection — add a code to INDICATORS and this fails until the page
    // agrees.
    const scraper = readFileSync('backend/scrapers/worldbank.py', 'utf8');
    const block = scraper.slice(
      scraper.indexOf('INDICATORS = ['),
      scraper.indexOf('TIMEOUT = 60'),
    );
    const codes = block.match(/^\s*\("[A-Z]{2}\.[A-Z0-9.]+",/gm) ?? [];
    // Plus anything asked for whose first observation has not landed yet:
    // the page's count is of what we ASK for, which includes those.
    const pending = EXPECTED_INCOMING.filter(
      (i) => !context.some((c) => c.id === i.id)
    );
    expect(codes.length).toBe(
      context.length + KNOWN_ABSENT.length + pending.length
    );
    const word = WORDS[codes.length];
    expect(word, `no word for ${codes.length} codes`).toBeTruthy();
    expect(sources).toMatch(new RegExp(`for ${word.toLowerCase()} indicators`));
  });
});
