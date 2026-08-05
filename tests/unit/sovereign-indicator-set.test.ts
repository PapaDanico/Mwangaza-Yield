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
] as const;

/**
 * Asked for and not returned. The World Bank publishes no observation for
 * Kenya against this code, which is the source's answer and not our failure —
 * `fetchedAt` on every shipped row is what distinguishes the two.
 */
const KNOWN_ABSENT = ['wb-gc-dod-totl-gd-zs']; // Government debt / GDP

describe('the sovereign indicator set is what we think it is', () => {
  it('ships a real file', () => {
    expect(context.length).toBeGreaterThan(3);
  });

  it('ships exactly the indicators we have accounted for', () => {
    const ids = context.map((i) => i.id).sort();
    expect(ids).toEqual([...EXPECTED].sort());
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
});
