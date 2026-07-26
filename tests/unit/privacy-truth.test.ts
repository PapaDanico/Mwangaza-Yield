import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEVICE_ONLY, SERVER_DELIVERABLE } from '../../src/lib/push-rules';

/**
 * Does the privacy notice describe this app, or a simpler one?
 *
 * The notice opened with "We do not collect your personal data, because the app
 * has nowhere to send it" and mentioned price alerts zero times — while
 * netlify/functions/subscribe.mts stores a push endpoint, its two keys and the
 * rules a reader chose, in Netlify Blobs.
 *
 * That claim was true when it was written. The alerts feature made it false and
 * nobody went back. That is how privacy notices fail: not by lying, but by
 * being outrun by the product, always in the direction that flatters.
 *
 * Kenya's Data Protection Act, 2019 makes accurate notification a duty (s.29),
 * so these tests read the SERVER CODE and check the page against it.
 */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const page = read('src/app/privacy/page.tsx');
const subscribe = read('netlify/functions/subscribe.mts');
const track = read('netlify/functions/track.mts');
/** Claims about what the page SAYS must not be satisfied by its own comments. */
const prose = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the server-side storage is disclosed', () => {
  /**
   * The teeth. There is exactly one thing this app stores about a reader, and
   * the notice used not to mention it at all.
   */
  it('tells the reader that alerts store a push endpoint', () => {
    expect(subscribe).toMatch(/getStore/);
    expect(prose).toMatch(/push endpoint/i);
    expect(prose).toMatch(/keys/i);
    expect(prose).not.toMatch(/no server that stores anything about\s+you/i);
  });

  it('says where that subscription physically sits', () => {
    // Cross-border transfer is its own duty. Naming the host is the minimum.
    expect(prose).toMatch(/Netlify Blobs/);
    expect(prose).toMatch(/outside Kenya/i);
  });

  it('promises only what the whitelist can actually guarantee', () => {
    /*
     * The page claims an alert can carry nothing about your holdings. That is
     * true only because the server accepts a fixed set of MARKET-WIDE rules and
     * the holding-dependent ones never leave the device. Both halves are
     * asserted: if a holding-aware rule is ever added to SERVER_DELIVERABLE,
     * the claim goes false and this fails.
     */
    expect(SERVER_DELIVERABLE.length).toBeGreaterThan(0);
    const holdingAware = /coupon|maturity|holding|portfolio|isin|position/i;
    for (const rule of SERVER_DELIVERABLE) {
      expect(
        rule,
        `"${rule}" became server-deliverable but depends on holdings — the notice promises alerts carry nothing about your money`,
      ).not.toMatch(holdingAware);
    }
    // ...and the rules that DO need holdings are on the device-only side.
    expect(DEVICE_ONLY.length).toBeGreaterThan(0);
    for (const rule of DEVICE_ONLY) expect(rule).toMatch(holdingAware);
    expect(prose).toMatch(/whitelist/i);
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
