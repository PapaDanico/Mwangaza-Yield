import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  DOCUMENTED_TOP_LEVEL,
  DOCUMENTED_FIELDS,
  FEED_JSON_URL,
  FEED_CSV_URL,
  FEED_CONTRACT_URL,
  FEED_SNIPPET,
} from '../../src/lib/feed-meta';

/**
 * The feed page must describe the feed we actually serve.
 *
 * A public page telling a third party to read `tbills[].netEAY` is a promise,
 * and the reader discovers a broken promise at the exact moment they are
 * deciding whether to trust us. That has already happened here once: the
 * contract link pointed into a private repository, so everyone the feed was
 * published for got a 404, and nobody reported it — it surfaced by accident.
 *
 * Prose inside a component cannot be checked. That is why the field names live
 * in feed-meta.ts as data and this holds them against the shipped payload.
 */

const feed = JSON.parse(readFileSync('public/data/rates.json', 'utf8')) as Record<string, unknown>;

describe('the page documents a feed that exists', () => {
  it('reads a real payload', () => {
    // Guards every assertion below from passing over an empty object.
    expect(Object.keys(feed).length).toBeGreaterThan(4);
  });

  it('every documented section is in rates.json', () => {
    const missing = DOCUMENTED_TOP_LEVEL.filter((k) => !(k in feed));
    expect(missing).toEqual([]);
  });

  it('every documented field is in its section', () => {
    const missing: string[] = [];
    for (const [section, fields] of Object.entries(DOCUMENTED_FIELDS)) {
      const value = feed[section];
      // tbills is an array of rows; the rest are objects.
      const sample = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | undefined;
      if (!sample) {
        missing.push(`${section}: section empty`);
        continue;
      }
      for (const f of fields) if (!(f in sample)) missing.push(`${section}.${f}`);
    }
    expect(missing).toEqual([]);
  });

  it('the T-bill rows carry a usable net yield, not just the key', () => {
    // `'netEAY' in row` is satisfied by null. The snippet calls .toFixed(2) on
    // it, so the promise is a finite number.
    const rows = feed.tbills as { netEAY: unknown; quotedDiscountRate: unknown }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number.isFinite(r.netEAY as number)).toBe(true);
      // The whole point of the field naming: net must be below the quote.
      expect(r.netEAY as number).toBeLessThan(r.quotedDiscountRate as number);
    }
  });
});

describe('the snippet a reader will copy actually works', () => {
  it('names only fields the feed has', () => {
    expect(FEED_SNIPPET).toContain('feed.tbills');
    expect(FEED_SNIPPET).toContain('netEAY');
    expect(FEED_SNIPPET).toContain(FEED_JSON_URL);
  });

  it('does not hand the reader the quote as though it were a return', () => {
    // quotedDiscountRate may be mentioned in prose as a warning, but the
    // example is what gets pasted, and it must not model the wrong field.
    expect(FEED_SNIPPET).not.toContain('quotedDiscountRate');
  });

  it('runs against the shipped payload and prints a plausible yield', () => {
    const rows = feed.tbills as { tenorDays: number; netEAY: number }[];
    const out = rows.map((b) => `${b.tenorDays}-day: ${b.netEAY.toFixed(2)}% net`);
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) expect(line).toMatch(/^\d{2,3}-day: \d{1,2}\.\d{2}% net$/);
  });
});

describe('the URLs the page publishes are files we ship', () => {
  const served = (url: string) => `public${url.replace(/^https?:\/\/[^/]+/, '')}`;

  it.each([FEED_JSON_URL, FEED_CSV_URL, FEED_CONTRACT_URL])('%s exists in public/', (url) => {
    // The contract link 404 is the reason this test exists; a URL on a public
    // page must correspond to a file that is actually deployed.
    expect(existsSync(served(url))).toBe(true);
  });

  it('points at the production host, not a preview or localhost', () => {
    for (const url of [FEED_JSON_URL, FEED_CSV_URL, FEED_CONTRACT_URL]) {
      expect(url).toMatch(/^https:\/\/mwangazayield\.org\//);
    }
  });
});
