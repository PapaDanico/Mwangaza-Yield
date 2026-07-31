import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
/**
 * Does the privacy notice describe this app, or a simpler one?
 *
 * ORIGINALLY this file existed because the notice claimed "we do not collect
 * your personal data" while subscribe.mts stored a push endpoint, its keys and
 * the reader's rules in Netlify Blobs. The claim was true when written and the
 * alerts feature made it false. That is how privacy notices fail: not by lying,
 * but by being outrun by the product, always in the direction that flatters.
 *
 * IT IS NOW INVERTED, because the push subscription was removed in July 2026
 * and the claim became true again. The assertions therefore flipped: they used
 * to require the page to ADMIT the endpoint, and now require it to say the
 * endpoint is gone — and require the server code to actually be absent, so the
 * page cannot be the only thing that changed.
 *
 * The failure mode is symmetrical and this file guards both ends. A notice that
 * hides collection is a s.29 breach; a notice that describes collection which
 * no longer happens names a processor receiving nothing and tells the reader
 * to worry about a thing that does not exist. Kenya's Data Protection Act,
 * 2019 makes accurate notification the duty — accurate in both directions.
 */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const page = read('src/app/privacy/page.tsx');
const track = read('netlify/functions/track.mts');
const exists = (p: string) => existsSync(new URL(`../../${p}`, import.meta.url).pathname);
/** Claims about what the page SAYS must not be satisfied by its own comments. */
const prose = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the server-side storage is disclosed', () => {
  it('holds no push subscription, in code as well as in prose', () => {
    /* The code half first. A page can be edited to say anything; what makes
     * the claim true is that the sender and the store are gone. */
    expect(exists('netlify/functions/subscribe.mts'), 'the subscribe endpoint is back').toBe(false);
    expect(exists('netlify/functions/send-alerts.mts'), 'the alert sender is back').toBe(false);
    expect(exists('src/lib/push.ts'), 'the push client is back').toBe(false);
    const sw = read('public/sw.js');
    expect(sw, "the service worker handles 'push' again").not.toMatch(
      /addEventListener\(\s*['"]push['"]/
    );
  });

  it('tells the reader the endpoint is gone rather than quietly dropping the subject', () => {
    /* Silence would be the tempting edit — delete the section and the notice is
     * no longer wrong. But a reader who turned alerts on last month and read
     * that we held an endpoint deserves to be told it was deleted, not to find
     * the paragraph missing. */
    expect(prose).toMatch(/push endpoint/i);
    expect(prose).toMatch(/removed|gone|deleted/i);
    expect(prose, 'the page still claims a live subscription').not.toMatch(
      /We store that endpoint/i
    );
  });

  it('states the cost of the change, not only the benefit', () => {
    /* Alerts no longer arrive while the app is closed. A notice that reports
     * only the privacy win is selling, not disclosing. */
    expect(prose).toMatch(/while the app is closed|when you open/i);
  });

  it('describes the counter as a counter, not as nothing', () => {
    expect(track).toMatch(/setJSON|store\./);
    expect(prose).toMatch(/tool counter/i);
    expect(prose).toMatch(/no cookies|sets no cookies/i);
  });
});

describe('it meets the shape section 29 asks for', () => {
  it('cites the Act rather than gesturing at it', () => {
    expect(prose).toMatch(/Data Protection Act, 2019/);
    expect(prose).toMatch(/section 29/i);
    expect(prose).toMatch(/[Ss]ection 26/);
  });

  it('gives the reader all four rights it claims to give, plus the regulator', () => {
    for (const right of [/informed/i, /access/i, /object/i, /deletion|delete/i, /correct/i]) {
      expect(prose).toMatch(right);
    }
    expect(prose).toMatch(/odpc\.go\.ke/);
    expect(prose).toMatch(/Data Protection Commissioner/);
  });

  it('names no analytics provider it does not run', () => {
    // A previous version credited Simple Analytics, which was never installed.
    expect(prose).not.toMatch(/Simple Analytics|Plausible|Google Analytics/i);
    const layout = read('src/app/layout.tsx');
    expect(layout).not.toMatch(/simpleanalytics|plausible|gtag|google-analytics/i);
  });
});
