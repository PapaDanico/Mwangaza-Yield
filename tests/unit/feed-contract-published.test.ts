import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The feed's contract must be readable by the people the feed is for.
 *
 * RATES-FEED.md lived in docs/, and JiPange's lib/rates-feed.ts — in a PUBLIC
 * repository — linked to it as
 *
 *   https://github.com/PapaDanico/Mwangaza-Yield/blob/main/docs/RATES-FEED.md
 *
 * pointing into a PRIVATE one. Every third party the feed exists for got a 404,
 * at the exact moment they were deciding whether to trust it. The feed carries
 * `Access-Control-Allow-Origin: *` precisely so outsiders can build on it; its
 * contract was unreadable to all of them.
 *
 * Nobody reported it, and no test could have caught it, because from inside the
 * organisation the link works. It surfaced when a proxy vendor cold-emailed
 * about the repository and prompted a look at how an outsider sees this project
 * at all — which is a poor detector to depend on.
 *
 * So the document now sits in public/data/, beside rates.json and rates.csv,
 * and this asserts it stays reachable and stays singular. Two copies of a
 * contract is how the published one quietly stops matching the real one.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p: string) => readFileSync(`${ROOT}${p}`, 'utf8');

describe('the rates-feed contract is actually published', () => {
  it('is served from the same directory as the feed', () => {
    expect(
      existsSync(`${ROOT}public/data/RATES-FEED.md`),
      'the contract is not in public/, so nothing outside this repo can read it'
    ).toBe(true);
  });

  it('is a real document, not a stub someone left behind', () => {
    const doc = read('public/data/RATES-FEED.md');
    expect(doc.length, 'suspiciously short for a contract').toBeGreaterThan(2_000);
    // The things a consumer needs before they can use it at all.
    expect(doc).toMatch(/rates\.json/);
    expect(doc).toMatch(/schema/i);
  });

  it('exists once, with docs/ pointing at it rather than copying it', () => {
    /* A second copy would drift, and the copy people can read is the one that
     * would end up wrong — the same failure as the OG card rendered from a
     * duplicated mark. */
    const pointer = read('docs/RATES-FEED.md');
    expect(pointer.length, 'docs/ looks like a full second copy, not a pointer').toBeLessThan(2_000);
    expect(pointer).toMatch(/public\/data\/RATES-FEED\.md|\/data\/RATES-FEED\.md/);
  });

  it('is served as readable markdown with cross-origin reads allowed', () => {
    /* Without its own rule it falls through to the generic /data/* header:
     * no CORS, no content type. That is exactly how the CSV shipped broken
     * once already, and the comment in netlify.toml says so. */
    const toml = read('netlify.toml');
    const block = toml.slice(toml.indexOf('for = "/data/RATES-FEED.md"'));
    const rule = block.slice(0, block.indexOf('[[headers]]') > 0 ? block.indexOf('[[headers]]') : 400);
    expect(rule, 'no Access-Control-Allow-Origin on the contract').toMatch(
      /Access-Control-Allow-Origin\s*=\s*"\*"/
    );
    expect(rule, 'not served as markdown').toMatch(/text\/markdown/);
  });
});
